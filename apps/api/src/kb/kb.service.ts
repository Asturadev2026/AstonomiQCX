import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant, type KbArticle } from '@aq/db';
import type { CreateKbArticleDto } from '@aq/shared';

@Injectable()
export class KbService {
  private prisma = getPrisma();

  create(tenantId: string, dto: CreateKbArticleDto): Promise<KbArticle> {
    return withTenant(this.prisma, tenantId, (tx) =>
      tx.kbArticle.create({
        data: {
          tenantId,
          title: dto.title,
          body: dto.body,
          category: dto.category,
          language: dto.language ?? 'en',
        },
      }),
    );
  }

  list(tenantId: string): Promise<KbArticle[]> {
    return withTenant(this.prisma, tenantId, (tx) =>
      tx.kbArticle.findMany({ where: { status: 'published' }, orderBy: { createdAt: 'desc' } }),
    );
  }

  /**
   * Finds articles whose title/body mention any of the question's words.
   * A stand-in for real semantic search (Guide §10.2/§10.3) — that needs an
   * embeddings provider (Voyage) to fingerprint articles and questions, which
   * isn't configured yet. This keeps Astra honestly grounded in the KB today;
   * swap for pgvector cosine search over kb_embeddings once a key exists.
   */
  async searchByKeyword(tenantId: string, question: string, limit = 5): Promise<KbArticle[]> {
    const words = question
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);
    if (words.length === 0) return [];

    return withTenant(this.prisma, tenantId, (tx) =>
      tx.kbArticle.findMany({
        where: {
          status: 'published',
          OR: words.flatMap((w) => [
            { title: { contains: w, mode: 'insensitive' as const } },
            { body: { contains: w, mode: 'insensitive' as const } },
          ]),
        },
        take: limit,
      }),
    );
  }
}
