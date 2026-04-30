import { NextRequest, NextResponse } from 'next/server';

function getBackendBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';
}

function buildBackendUrl(pathParts: string[]) {
  const path = pathParts.join('/');
  const base = getBackendBaseUrl();
  return `${base}/${path}`;
}

function filterForwardHeaders(headers: Headers) {
  // hop-by-hop/불필요 헤더 제거
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');
  return headers;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await context.params;
  const pathParts = path ?? [];
  const url = buildBackendUrl(pathParts);

  const res = await fetch(url, {
    method: 'GET',
    headers: filterForwardHeaders(new Headers(req.headers)),
  });

  return new NextResponse(await res.arrayBuffer(), {
    status: res.status,
    headers: res.headers,
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await context.params;
  const pathParts = path ?? [];
  const url = buildBackendUrl(pathParts);

  const body = await req.arrayBuffer();

  // req.headers를 그대로 넘기면 content-length 등 일부 헤더가 충돌할 수 있어 필터링
  const headers = new Headers(req.headers);
  filterForwardHeaders(headers);

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });

  return new NextResponse(await res.arrayBuffer(), {
    status: res.status,
    headers: res.headers,
  });
}

