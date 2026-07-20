import { Injectable } from '@nestjs/common';
import { getPrisma } from '@aq/db';
import type { AiPersonaDto, AiPersonaTone, UpdateAiPersonaDto } from '@aq/shared';

const TONE_LINES: Record<AiPersonaTone, string> = {
  friendly: 'Warm, upbeat and approachable.',
  formal: 'Professional and formal — no slang.',
  concise: 'Brief and to the point — no filler.',
  empathetic: "Empathetic and reassuring — acknowledge the customer's frustration first.",
  playful: 'Light and a little playful, while staying respectful.',
};

/** Astra's tone/style, shared by every channel (Chatbot, WhatsApp, Voice) — Guide §10.3/§12. */
@Injectable()
export class AiPersonaService {
  private prisma = getPrisma();

  async get(tenantId: string): Promise<AiPersonaDto> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return { tone: tenant.aiPersonaTone as AiPersonaTone, description: tenant.aiPersonaDescription };
  }

  async update(tenantId: string, dto: UpdateAiPersonaDto): Promise<AiPersonaDto> {
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { aiPersonaTone: dto.tone, aiPersonaDescription: dto.description },
    });
    return { tone: updated.aiPersonaTone as AiPersonaTone, description: updated.aiPersonaDescription };
  }

  /** Turns a persona into a prompt-prefix line, or '' when there's nothing to add beyond the default. */
  buildInstruction(persona: AiPersonaDto): string {
    const toneLine = TONE_LINES[persona.tone] ?? '';
    const extra = persona.description.trim();
    if (!toneLine && !extra) return '';
    return `Persona: ${toneLine}${extra ? ` ${extra}` : ''}`;
  }
}
