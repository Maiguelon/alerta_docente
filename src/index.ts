export interface Env {
  EMAIL_PROVIDER: string;
}

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname !== "/healthz") {
      return new Response("Not found", { status: 404 });
    }
    return Response.json({ service: "alerta-docente", status: "initializing" });
  },
} satisfies ExportedHandler<Env>;
