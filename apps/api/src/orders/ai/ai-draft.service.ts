import { aiAddressFacts } from './ai-address-policy';
import { aiNoteFact } from './ai-note-policy';
import { Injectable } from '@nestjs/common';
import { aiItemMapPrompt, aiSourceItems } from './ai-item-policy';
import {
  AppHttpException,
  notFoundError,
  serviceUnavailableError,
  tooManyRequestsError,
} from '../../common/http/app-http.exception';
import {
  AiDraftValidationError,
  aiDraftPrompt,
  buildAiDraftSchema,
  decodeAiDraft,
  prepareAiDraftForReview,
  aiSourceLines,
} from './ai-draft.contract';

export function localAiOrigin(env = process.env): string {
  if (env.NODE_ENV !== 'development' || env.FOM_AI_LOCAL_ENABLED !== 'true')
    throw notFoundError('Local AI prototype is disabled.');
  // Exact numeric loopback: no DNS resolution, redirects, URL credentials or paths.
  const value = env.FOM_AI_LOCAL_URL ?? '';
  if (
    !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(value) ||
    Number(value.split(':').at(-1)) > 65535
  ) {
    throw serviceUnavailableError(
      'Set FOM_AI_LOCAL_URL to the loopback origin printed by the local launcher.',
    );
  }
  return value;
}

function responseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid_server_response');
  return value as Record<string, unknown>;
}

@Injectable()
export class AiDraftService {
  private busy = false;

  async extract(message: string) {
    const origin = localAiOrigin();
    if (
      typeof message !== 'string' ||
      message.trim().length < 5 ||
      message.length > 5000
    ) {
      throw new AppHttpException(422, {
        code: 'AI_INPUT_LIMIT',
        message: 'Enter between 5 and 5,000 characters. Nothing is truncated.',
      });
    }
    if (this.busy)
      throw tooManyRequestsError(
        'Local AI is busy. Wait for the current extraction to finish.',
      );
    this.busy = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const start = Date.now();
    try {
      const post = async (path: string, body: unknown) => {
        let response: Response;
        try {
          response = await fetch(`${origin}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
            redirect: 'error',
          });
        } catch (error) {
          if (controller.signal.aborted) throw error;
          throw new AppHttpException(503, {
            code: 'AI_LOCAL_CONNECTION_FAILED',
            message: `Local extraction failed: cannot connect to the inference server at ${origin}. Keep the model launcher open, copy its current FOM_AI_LOCAL_URL and restart the API with that value. The port changes each launch. No order was created.`,
          });
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new AppHttpException(503, {
            code: 'AI_LOCAL_SERVER_ERROR',
            message: `Local inference server returned HTTP ${response.status} at ${path}. Check that FOM_AI_LOCAL_URL points to the ready model launcher. No order was created.`,
          });
        }
        // Bound even malformed server responses, without logging content.
        if (!response.body) throw new Error('empty_response');
        const reader = response.body.getReader();
        let bytes = 0;
        const chunks: Uint8Array[] = [];
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.length;
            if (bytes > 1024 * 1024) throw new Error('response_limit');
            chunks.push(value);
          }
        } finally {
          await reader.cancel();
        }
        return responseObject(
          JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
        );
      };
      const itemMap = aiSourceItems(message);
      const addressFacts = aiAddressFacts(message);
      const hasAddressFacts = !!(addressFacts.address || addressFacts.township);
      const noteFact = aiNoteFact(message);
      const lines = aiSourceLines(message).map((text, index) => ({
        line: index + 1,
        text,
      }));
      const messages = [
        {
          role: 'system',
          content:
            aiDraftPrompt +
            (itemMap ? aiItemMapPrompt : '') +
            (hasAddressFacts
              ? '\nThe address_facts are source-derived constraints. Copy their values exactly and cite all their lines. Do not omit continuation lines.'
              : '') +
            (noteFact
              ? '\nThe note_fact was derived from a fully recognized labelled message. Copy its value exactly; null means no fulfillment note. Cite its lines. Payment-only or phone-correction-only lines are not notes.'
              : ''),
        },
        {
          role: 'user',
          content: JSON.stringify(
            itemMap || hasAddressFacts || noteFact
              ? {
                  lines,
                  ...(noteFact ? { note_fact: noteFact } : {}),
                  ...(itemMap ? { item_map: itemMap } : {}),
                  ...(hasAddressFacts ? { address_facts: addressFacts } : {}),
                }
              : lines,
          ),
        },
      ];
      const template = await post('/apply-template', {
        messages,
        add_generation_prompt: true,
        chat_template_kwargs: { enable_thinking: false },
      });
      if (typeof template.prompt !== 'string')
        throw new Error('invalid_template');
      const tokens = await post('/tokenize', {
        content: template.prompt,
        add_special: true,
      });
      if (!Array.isArray(tokens.tokens)) throw new Error('invalid_tokens');
      if (tokens.tokens.length + 2048 + 64 > 8192)
        throw new AppHttpException(422, {
          code: 'AI_CONTEXT_LIMIT',
          message:
            'This message exceeds the local model context. Shorten it and try again; nothing was truncated.',
        });
      const response = await post('/v1/chat/completions', {
        messages,
        max_tokens: 2048,
        temperature: 0.7,
        top_p: 0.8,
        top_k: 20,
        seed: 42,
        stream: false,
        cache_prompt: false,
        chat_template_kwargs: { enable_thinking: false },
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'fom_local_draft',
            strict: true,
            schema: buildAiDraftSchema(message),
          },
        },
      });
      if (!Array.isArray(response.choices) || response.choices.length !== 1)
        throw new Error('invalid_server_response');
      const choice = responseObject(response.choices[0]);
      const completion = responseObject(choice.message);
      if (
        choice.finish_reason !== 'stop' ||
        typeof completion.content !== 'string'
      )
        throw new Error('incomplete_output');
      const result = decodeAiDraft(
        JSON.parse(completion.content) as unknown,
        message,
      );
      return {
        ...prepareAiDraftForReview(result, message),
        model: 'Qwen3-4B (local prototype)',
        elapsed_ms: Date.now() - start,
      };
    } catch (error) {
      if (error instanceof AppHttpException) throw error;
      if (error instanceof AiDraftValidationError) {
        const reasons = {
          address_source_mismatch:
            'The model omitted part of the recorded address evidence.',
          item_source_mismatch:
            'The model omitted an item detail or mixed details from different product blocks.',
          duplicate_item: 'The model repeated an item from the same source.',
          invalid_schema: 'The model returned fields with an invalid format.',
          invalid_evidence:
            'The model changed a source quotation or cited an unknown field.',
          missing_evidence: 'The model omitted a required source quotation.',
          unsupported_number:
            'An extracted quantity or amount does not match its source.',
          unsupported_phone:
            'The extracted phone number does not match its source quotation.',
        };
        throw new AppHttpException(502, {
          code: 'AI_DRAFT_INVALID',
          message: `Local extraction failed validation: ${reasons[error.reason]}${error.field ? ` Field: ${error.field}.` : ''} No order was created. Review the original message or use Draft from chat.`,
          context: {
            reason: error.reason,
            ...(error.field ? { field: error.field } : {}),
          },
        });
      }
      const invalidOutput =
        error instanceof SyntaxError ||
        (error instanceof Error &&
          [
            'invalid_schema',
            'invalid_evidence',
            'missing_evidence',
            'incomplete_output',
          ].includes(error.message));
      throw serviceUnavailableError(
        controller.signal.aborted
          ? 'Local extraction exceeded 60 seconds. No order was created.'
          : invalidOutput
            ? 'Local extraction failed validation: the model returned invalid JSON, incomplete fields or unsupported source evidence. Review the message or use the existing parser. No order was created.'
            : 'Local extraction failed: the local inference server was unavailable or returned an invalid response. Check the launcher. No order was created.',
      );
    } finally {
      clearTimeout(timer);
      this.busy = false;
    }
  }
}
