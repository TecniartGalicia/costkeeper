/**
 * Fixtures sintéticos. Nunca se usan sesiones reales en las pruebas: llevan
 * prompts y código.
 */

export interface OpcionesMensaje {
  id?: string;
  modelo?: string;
  entrada?: number;
  salida?: number;
  cacheLectura?: number;
  cache5m?: number;
  cache1h?: number;
  cwd?: string;
  rama?: string;
  sesion?: string;
  ts?: string;
  subagente?: boolean;
  /** Texto que no debe acabar nunca en el índice ni en la exportación. */
  prompt?: string;
}

export function mensajeClaude(o: OpcionesMensaje = {}): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: o.ts ?? '2026-08-24T10:00:00.000Z',
    cwd: o.cwd ?? 'C:\\Proy\\Uno',
    gitBranch: o.rama ?? 'main',
    sessionId: o.sesion ?? 's1',
    isSidechain: o.subagente ?? false,
    userType: 'external',
    requestId: `req_${o.id ?? 'a'}`,
    message: {
      id: o.id ?? 'a',
      type: 'message',
      role: 'assistant',
      model: o.modelo ?? 'claude-opus-5',
      content: [{ type: 'text', text: o.prompt ?? 'texto de la respuesta' }],
      usage: {
        input_tokens: o.entrada ?? 100,
        output_tokens: o.salida ?? 10,
        cache_read_input_tokens: o.cacheLectura ?? 1000,
        cache_creation: {
          ephemeral_5m_input_tokens: o.cache5m ?? 200,
          ephemeral_1h_input_tokens: o.cache1h ?? 500,
        },
        output_tokens_details: { thinking_tokens: 0 },
      },
    },
  });
}

export interface OpcionesCuota {
  usadoPorCiento?: number;
  ventanaMinutos?: number;
  reiniciaEn?: number;
  plan?: string;
}

export function tokenCount(total: number, cuota?: OpcionesCuota): string {
  return JSON.stringify({
    timestamp: '2026-08-24T10:00:00.000Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: total,
          cached_input_tokens: 0,
          cache_write_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
          total_tokens: total,
        },
        last_token_usage: { input_tokens: total, output_tokens: 0, total_tokens: total },
        model_context_window: 258400,
      },
      ...(cuota
        ? {
            rate_limits: {
              limit_id: 'codex',
              primary: {
                used_percent: cuota.usadoPorCiento ?? 0,
                window_minutes: cuota.ventanaMinutos ?? 10080,
                resets_at: cuota.reiniciaEn ?? 1787860920,
              },
              secondary: null,
              plan_type: cuota.plan ?? 'plus',
            },
          }
        : {}),
    },
  });
}

export interface OpcionesRollout {
  sesion?: string;
  cwd?: string;
  modelo?: string;
  eventos?: string[];
}

export function rolloutCodex(o: OpcionesRollout = {}): string {
  const meta = JSON.stringify({
    timestamp: '2026-08-24T09:59:00.000Z',
    type: 'session_meta',
    payload: {
      session_id: o.sesion ?? 'sesion-1',
      id: o.sesion ?? 'sesion-1',
      cwd: o.cwd ?? '/proy',
      originator: 'codex_vscode',
      cli_version: '0.149.0',
      base_instructions: { provenance: { type: 'model', model: o.modelo ?? 'gpt-5.6-sol' } },
    },
  });
  return [meta, ...(o.eventos ?? [])].join('\n') + '\n';
}
