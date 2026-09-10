export function pct(value) {
    const n = Number(value || 0);
    return `${Math.round(n * 100)}%`;
}
export function chunkText(text, max = 3900) {
    const chunks = [];
    let rest = text;
    while (rest.length > max) {
        let cut = rest.lastIndexOf('\n', max);
        if (cut < max * .6)
            cut = max;
        chunks.push(rest.slice(0, cut));
        rest = rest.slice(cut).replace(/^\n+/, '');
    }
    if (rest)
        chunks.push(rest);
    return chunks;
}
