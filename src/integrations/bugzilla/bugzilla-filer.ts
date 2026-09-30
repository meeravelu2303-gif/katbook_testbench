import { BugzillaConfig, JUDGED_RESOLUTIONS } from '../../config/bugzilla.config';
import { buildBugFields, buildSummary, FailureDetails, sameFault } from './bug-builder';
import { computeFingerprintTag } from './bug-fingerprint';
import { BugzillaClient } from './bugzilla-client';

export type FilerOutcome =
  | { action: 'commented'; bugId: number; tag: string }
  | { action: 'reopened'; bugId: number; tag: string }
  | { action: 'created'; bugId: number; tag: string }
  | { action: 'skipped-judged'; bugId: number; tag: string }
  | { action: 'search-failed'; tag: string; reason: string };

/**
 * Duplicate-detection + filing, per CLAUDE.md's governance rule:
 * open dup -> comment; resolved-but-not-judged dup -> reopen + comment; judged
 * (INVALID/WONTFIX/WORKSFORME/DUPLICATE) dup -> skip forever; no match -> file new.
 * A failed search never creates a bug — never risk a duplicate on a transient error.
 */
export class BugzillaFiler {
  constructor(
    private readonly config: BugzillaConfig,
    private readonly client: BugzillaClient,
  ) {}

  async process(failure: FailureDetails): Promise<FilerOutcome> {
    const tag = computeFingerprintTag({
      endpoint: failure.endpoint,
      validator: failure.testTitle,
      message: failure.errorStack,
    });

    const byTag = await this.client.findByTag(tag);
    if (this.client.isFailure(byTag)) {
      return { action: 'search-failed', tag, reason: byTag.message };
    }
    const tagMatch = byTag.bugs[0] as { id: number; resolution?: string } | undefined;

    if (tagMatch) {
      return this.handleExisting(tagMatch, tag, failure);
    }

    const summary = buildSummary(tag, failure);
    const byPhrase = await this.client.findOpenByPhrase(this.config.product, this.config.component, summary.slice(0, 60));
    if (this.client.isFailure(byPhrase)) {
      return { action: 'search-failed', tag, reason: byPhrase.message };
    }
    const phraseMatch = (byPhrase.bugs as Array<{ id: number; summary?: string; resolution?: string }>).find((b) =>
      sameFault(b.summary ?? '', summary),
    );
    if (phraseMatch) {
      return this.handleExisting(phraseMatch, tag, failure, /* adopt */ true);
    }

    if (this.config.dryRun) {
      return { action: 'created', bugId: -1, tag };
    }
    const fields = buildBugFields(this.config, tag, failure);
    const created = await this.client.createBug(fields);
    if (this.client.isFailure(created)) {
      return { action: 'search-failed', tag, reason: created.message };
    }
    return { action: 'created', bugId: created.id, tag };
  }

  private async handleExisting(
    match: { id: number; resolution?: string },
    tag: string,
    failure: FailureDetails,
    adopt = false,
  ): Promise<FilerOutcome> {
    const resolution = match.resolution ?? '';
    if (resolution && JUDGED_RESOLUTIONS.includes(resolution)) {
      return { action: 'skipped-judged', bugId: match.id, tag };
    }

    if (this.config.dryRun) {
      return resolution ? { action: 'reopened', bugId: match.id, tag } : { action: 'commented', bugId: match.id, tag };
    }

    if (adopt) {
      await this.client.appendWhiteboard(match.id, tag);
    }
    await this.client.addComment(match.id, `Reproduced again.\n\n${failure.errorStack}`);

    if (resolution) {
      await this.client.reopen(match.id);
      return { action: 'reopened', bugId: match.id, tag };
    }
    return { action: 'commented', bugId: match.id, tag };
  }
}
