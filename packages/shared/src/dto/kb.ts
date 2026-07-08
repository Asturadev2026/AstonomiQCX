/** Guide §10 pattern, applied to the Knowledge Base (Astra's context source). */

export interface CreateKbArticleDto {
  title: string;
  body: string;
  category?: string;
  language?: string;
}

export interface KbArticleDto {
  id: string;
  title: string;
  body: string;
  category: string | null;
  language: string;
  status: string;
  views: number;
  createdAt: string;
}
