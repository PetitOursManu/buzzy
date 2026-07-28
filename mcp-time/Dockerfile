# Serveur MCP « Time » officiel (modelcontextprotocol/servers).
# Donne au modèle la date réelle du jour et la conversion de fuseaux.
# Utile pour la veille d'événements : sans cela, le modèle raisonne à partir
# de sa date d'entraînement et se trompe d'année ou d'édition.
FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Le SDK Python « mcp » 2.x a déplacé McpError : les serveurs de référence
# ne sont compatibles qu'avec la branche 1.x — d'où le verrouillage.
RUN pip install --no-cache-dir --break-system-packages 'mcp<2' mcp-server-time \
    && npm install -g supergateway@latest \
    && npm cache clean --force

ENV MCP_PORT=8000
ENV LOCAL_TIMEZONE=Europe/Paris
EXPOSE 8000

CMD ["sh", "-c", "supergateway --stdio \"python3 -m mcp_server_time --local-timezone $LOCAL_TIMEZONE\" --outputTransport streamableHttp --port \"$MCP_PORT\" --host 0.0.0.0"]
