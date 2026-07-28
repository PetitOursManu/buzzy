# Image SearXNG pré-configurée pour Buzzy.
#
# La configuration est COPIÉE dans l'image plutôt que montée depuis l'hôte :
# un bind mount « ./searxng/settings.yml » échoue sur les plateformes qui ne
# conservent pas le dépôt sur disque au moment de l'exécution (Coolify, CI…).
# Docker crée alors un DOSSIER vide à la place du fichier, et SearXNG boucle
# sur « settings.yml is not a valid file, exiting ».
#
# Le fichier reste inscriptible pour que l'entrypoint SearXNG puisse y injecter
# SEARXNG_SECRET / SEARXNG_BASE_URL si ces variables sont fournies.
#
# La configuration est placée HORS de /etc/searxng : l'image déclare ce
# dossier comme VOLUME, et un volume anonyme persistant masquerait le fichier
# copié (settings.yml vu vide dans le conteneur). SEARXNG_SETTINGS_PATH pointe
# donc vers un emplacement stable, immunisé contre les volumes résiduels.
FROM searxng/searxng:latest

COPY --chown=searxng:searxng searxng/settings.yml /usr/local/searxng/buzzy-settings.yml

ENV SEARXNG_SETTINGS_PATH=/usr/local/searxng/buzzy-settings.yml
