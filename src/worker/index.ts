import { handleITJobsSearch, type JobFinderWorkerEnv } from './itjobs-search';

const worker = {
  fetch(request: Request, env: JobFinderWorkerEnv): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname !== '/api/itjobs/search') {
      return Promise.resolve(new Response(JSON.stringify({ error: { code: 'not_found', message: 'Endpoint não encontrado.' } }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
      }));
    }
    return handleITJobsSearch(request, env);
  },
};

export default worker;
