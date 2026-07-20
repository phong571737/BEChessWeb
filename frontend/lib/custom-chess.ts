const COMMENT_RE = /\{[^}]*\}/g;
const NAG_RE = /\$\d+/g;
const MOVE_NUMBER_RE = /\d+\.(\.\.)?/g;
const RESULT_RE = /\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/;

export function extractSanMoves(pgn: string | null | undefined): string[] {
    if (!pgn?.trim()) return [];

    // remove header block "[Key "Value"]"
    const movetext = pgn
        .split("\n")
        .filter((line) => !line.trim().startsWith("["))
        .join(" ")
        .trim();

    if (!movetext) return [];

    // split into token
    return movetext
        .replace(COMMENT_RE, " ")      // remove comment {...}
        .replace(NAG_RE, " ")          // remove NAG $1 $2...
        .replace(RESULT_RE, "")        // bỏ kết quả ván (1-0, 0-1, 1/2-1/2, *)
        .replace(MOVE_NUMBER_RE, " ")  // bỏ số thứ tự nước đi "1." "2..." 
        .split(/\s+/)                  // tách theo khoảng trắng
        .filter(Boolean);              // bỏ chuỗi rỗng
}