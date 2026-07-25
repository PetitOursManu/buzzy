# Wrapper MCP HTTP autour de SearXNG.
# mcp-searxng est un serveur MCP en stdio ; on l'expose en Streamable HTTP
# via supergateway, pour que Buzzy (client MCP HTTP/SSE) puisse s'y connecter
# sans lancer de sous-processus dans le conteneur applicatif.
FROM node:20-alpine

RUN npm install -g mcp-searxng@latest supergateway@latest

ENV SEARXNG_URL=http://searxng:8080
ENV MCP_PORT=8000

EXPOSE 8000

# supergateway lance mcp-searxng (stdio) et expose /mcp en Streamable HTTP.
CMD ["sh", "-c", "supergateway --stdio 'mcp-searxng' --outputTransport streamableHttp --port \"$MCP_PORT\" --host 0.0.0.0"]
