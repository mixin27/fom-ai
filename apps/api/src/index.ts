/** Experimental extraction boundary. No database access or order creation. */
export { AiDraftService as OrderExtractor, localAiOrigin } from './orders/ai/ai-draft.service';
export { AiDraftValidationError, validateAiExtraction, decodeAiDraft, prepareAiDraftForReview } from './orders/ai/ai-draft.contract';
export { AppHttpException as ExtractionError } from './common/http/app-http.exception';
