FROM node:25-alpine AS frontend-build
WORKDIR /src/frontend

COPY frontend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# COPY frontend/ ./
# RUN npm test --if-present
# RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-build
WORKDIR /src

COPY snn-sandbox.sln ./
COPY backend/SnnSandbox/SnnSandbox.csproj ./backend/SnnSandbox/
COPY backend/SnnSandbox.Tests/SnnSandbox.Tests.csproj ./backend/SnnSandbox.Tests/

RUN dotnet restore ./snn-sandbox.sln

COPY backend/ ./backend/
RUN dotnet build ./snn-sandbox.sln --configuration Release --no-restore
RUN dotnet test ./snn-sandbox.sln --configuration Release --no-build --verbosity normal
RUN dotnet publish ./backend/SnnSandbox/SnnSandbox.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app

COPY --from=backend-build /app/publish ./
# COPY --from=frontend-build /src/frontend/dist ./wwwroot

ENV ASPNETCORE_URLS=http://+:5000
ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 5000

ENTRYPOINT ["dotnet", "SnnSandbox.dll"]