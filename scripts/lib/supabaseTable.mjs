// Shared by backup-supabase.mjs and sync-notion.mjs: read one Supabase table
// completely, in pages, via the REST API and a service-role key.
//
// PostgREST caps a response at 1000 rows by default, so a single unpaged GET
// on a growing table would silently return a prefix. Ordering by a stable
// column makes the paging deterministic.

const PAGE_SIZE = 1000;

export async function fetchAllRows(url, key, table, orderBy) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const endpoint = `${url}/rest/v1/${table}`
      + `?select=*&order=${encodeURIComponent(orderBy)}`
      + `&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(endpoint, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`${table}: HTTP ${res.status} ${body.slice(0, 300)}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}
