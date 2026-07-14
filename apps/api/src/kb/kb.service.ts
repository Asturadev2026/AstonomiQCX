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
   * Real view counting — the prototype's article view counts were fabricated;
   * this makes them real. Raw SQL rather than `tx.kbArticle.update()` on
   * purpose: Prisma's `@updatedAt` bumps on ANY update to the row, which
   * would make "Updated X ago" lie and say "just now" every time someone
   * merely views an article rather than edits it.
   */
  async incrementView(tenantId: string, id: string): Promise<KbArticle> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      await tx.$executeRaw`UPDATE kb_articles SET views = views + 1 WHERE id = ${id}::uuid`;
      return tx.kbArticle.findUniqueOrThrow({ where: { id } });
    });
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
