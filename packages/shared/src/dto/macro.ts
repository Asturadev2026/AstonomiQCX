/** Guide's module tour: "Macro is a ready-made reply" — one-click canned responses for agents. */

export interface CreateMacroDto {
  title: string;
  body: string;
  category?: string;
}

export interface MacroDto {
  id: string;
  title: string | null;
  category: string | null;
  body: string | null;
  uses: number;
}
