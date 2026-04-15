// Apollo.io client — people & organization search for lodge outbound.
// Docs: https://docs.apollo.io/reference/people-search
//
// Requires APOLLO_API_KEY in env. Uses Basic plan endpoints only.

const APOLLO_BASE = "https://api.apollo.io/api/v1";

function apiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY not set");
  return key;
}

async function apolloPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": apiKey(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo ${path} ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

// --- Types (minimal — Apollo returns many more fields; add as needed) ---

export interface ApolloPerson {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  title: string | null;
  email: string | null;
  email_status: string | null; // "verified" | "guessed" | "unverified" | ...
  linkedin_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  organization: ApolloOrganization | null;
}

export interface ApolloOrganization {
  id: string;
  name: string | null;
  website_url: string | null;
  primary_domain: string | null;
  phone: string | null;
  estimated_num_employees: number | null;
  industry: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  short_description: string | null;
}

export interface ApolloSearchResponse {
  people: ApolloPerson[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
}

// --- Search: US fishing lodges, owner/GM titles, small team ---

export interface LodgeSearchParams {
  page?: number;
  perPage?: number;
  keywords?: string; // default: "fishing lodge"
  titles?: string[]; // default: owner / general manager / president
}

export async function searchLodgeDecisionMakers(
  params: LodgeSearchParams = {}
): Promise<ApolloSearchResponse> {
  const {
    page = 1,
    perPage = 25,
    keywords = "fishing lodge",
    titles = ["owner", "general manager", "president", "founder", "proprietor"],
  } = params;

  return apolloPost<ApolloSearchResponse>("/mixed_people/search", {
    q_keywords: keywords,
    person_titles: titles,
    person_locations: ["United States"],
    organization_num_employees_ranges: ["1,10", "11,20", "21,50"],
    page,
    per_page: perPage,
  });
}

// --- Enrichment (optional — search already returns most of what we need) ---

export async function enrichOrganization(domain: string): Promise<ApolloOrganization | null> {
  const data = await apolloPost<{ organization: ApolloOrganization | null }>(
    "/organizations/enrich",
    { domain }
  );
  return data.organization;
}
