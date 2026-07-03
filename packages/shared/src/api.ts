/** API envelope conventions (Guide D.7 + Appendix B). */

export interface ListMeta {
  nextCursor: string | null;
  total: number;
}

export interface ApiList<T> {
  data: T[];
  meta: ListMeta;
}

export interface ApiItem<T> {
  data: T;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}
