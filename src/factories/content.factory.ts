import { baseFactory } from './base.factory';
import { ContentTypeInput } from '../client/content-type.client';
import { ContentPreparationInput } from '../client/content-preparation.client';

export function buildContentType(companyId: string): ContentTypeInput {
  return {
    companyId,
    contentName: `${baseFactory.testTag()} name`,
    contentType: `${baseFactory.testTag()} type`,
    mappingType: 'Unit',
  };
}

export function buildContentAttributeName(): string {
  return `${baseFactory.testTag()} attribute`;
}

export function buildScratchCode(): string {
  return `console.log("${baseFactory.testTag()}")`;
}

export function buildContentPreparationName(companyId: string): ContentPreparationInput {
  return {
    companyId,
    name: `${baseFactory.testTag()} activity`,
    isRework: false,
  };
}
