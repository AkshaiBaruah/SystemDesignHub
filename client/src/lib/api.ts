import type { ComponentDef, Design, ValidationResult, AnalysisResult } from "./types";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchComponents(): Promise<ComponentDef[]> {
  const data = await apiFetch<{ components: ComponentDef[] }>("/api/components");
  return data.components;
}

export async function createDesign(): Promise<{ id: string; shareUrl: string }> {
  return apiFetch("/api/designs", { method: "POST", body: JSON.stringify({}) });
}

export async function createExampleDesign(): Promise<{ id: string }> {
  return apiFetch("/api/designs/from-template", { method: "POST", body: JSON.stringify({}) });
}

export async function fetchDesign(id: string): Promise<Design> {
  return apiFetch(`/api/designs/${id}`);
}

export async function patchDesign(
  id: string,
  patch: { name?: string; canvas?: { nodes: unknown[]; edges: unknown[] } }
): Promise<{ updatedAt: string }> {
  return apiFetch(`/api/designs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function validateDesign(designId: string): Promise<ValidationResult> {
  return apiFetch("/api/validate", { method: "POST", body: JSON.stringify({ designId }) });
}

export async function analyzeDesign(designId: string): Promise<AnalysisResult> {
  return apiFetch("/api/analyze", { method: "POST", body: JSON.stringify({ designId }) });
}
