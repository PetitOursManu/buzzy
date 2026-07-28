# Serveur MCP « Fetch » officiel (modelcontextprotocol/servers).
# Permet au modèle d'OUVRIR réellement une page web trouvée par la recherche
# et d'en extraire le contenu en markdown : c'est le garde-fou décisif contre
# les événements et les URLs inventés (search → fetch → vérification).
#
# Le serveur officiel parle stdio ; supergateway l'expose en Streamable HTTP
# pour que Buzzy (client MCP HTTP/SSE) puisse s'y connecter sans lancer de
# sous-processus dans le conteneur applicatif.
FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Le SDK Python « mcp » 2.x a déplacé McpError : les serveurs de référence
# ne sont compatibles qu'avec la branche 1.x — d'où le verrouillage.
RUN pip install --no-cache-dir --break-system-packages 'mcp<2' mcp-server-fetch \
    && npm install -g supergateway@latest \
    && npm cache clean --force

ENV MCP_PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "supergateway --stdio 'python3 -m mcp_server_fetch --ignore-robots-txt' --outputTransport streamableHttp --port \"$MCP_PORT\" --host 0.0.0.0"]
