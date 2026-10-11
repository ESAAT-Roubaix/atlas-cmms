# Backend Atlas CMMS recompilé avec le correctif ESAAT (local-entitlements.patch) :
# la variable LOCAL_ENTITLEMENTS active des options sans clé de licence.
# Atlas est utilisé sous AGPLv3, qui autorise cette modification.

# Commit correspondant à l'image intelloop/atlas-cmms-backend:latest du 30/09/2026
ARG ATLAS_COMMIT=6af6ea1d53

FROM maven:3.9.9-eclipse-temurin-17 AS build
ARG ATLAS_COMMIT
WORKDIR /src
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends patch >/dev/null \
 && curl -fsSL "https://codeload.github.com/Grashjs/cmms/tar.gz/${ATLAS_COMMIT}" \
  | tar xz --strip-components=2 --wildcards "*/api"
COPY local-entitlements.patch /tmp/
RUN patch -p1 < /tmp/local-entitlements.patch \
 && mvn -q clean package -DskipTests

# Même étage d'exécution que l'image officielle (api/Dockerfile)
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /src/target/*.jar my-spring-boot-app.jar
EXPOSE 8080
CMD ["sh", "-c", "java --add-opens=java.base/java.lang=ALL-UNNAMED $JAVA_OPTS -jar /app/my-spring-boot-app.jar"]
