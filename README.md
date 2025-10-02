# SPACE-JUMP  
**Replicación y Alta Disponibilidad en un Juego de Apuestas en Tiempo Real**

## Project Information  
**Developed by:**  
- Mileth Martinez
- Oscar Gonzales
- Juan López
  
**Institution:**  
Universidad Pedagógica y Tecnológica de Colombia  
Faculty of Engineering  
Systems and Computer Engineering  

---

## Introduction  
El presente laboratorio tiene como objetivo principal el diseño e implementación de una **aplicación distribuida** que simula una **sala de apuestas en tiempo real**, inspirada en el juego *Aviator*.  

El núcleo del laboratorio se centra en:  
- **Alta disponibilidad de datos** mediante un clúster de bases de datos replicado en configuración **Maestro-Esclavo (Replica Set)**.  
- **Consistencia de la aplicación** incluso ante la caída del nodo principal.  
- **Comunicación en tiempo real** con **WebSockets**, replicada entre múltiples instancias de backend mediante **Redis**.  
- **Balanceo de carga** con **Nginx** para distribuir clientes y garantizar tolerancia a fallos.  

---

## Objectives and Skills Acquired  
1. Diseño de arquitecturas distribuidas con alta disponibilidad.  
2. Configuración de replicación en **MongoDB** (Replica Set).  
3. Implementación de estrategias de **failover**.  
4. Integración de **WebSockets** para comunicación en tiempo real.  
5. Interconexión de múltiples servicios en una **LAN**.  

---

## Requirements  
Antes de iniciar, asegúrese de tener instalados:  
- [Node.js 20](https://nodejs.org/)  
- [MongoDB Community Edition](https://www.mongodb.com/try/download/community) (`mongod`, `mongosh`)  
- [Redis](https://redis.io/download/) (`redis-server`)  
- [Nginx](https://nginx.org/en/download.html`)  
- **Sistema operativo recomendado:** Linux (Ubuntu/Debian) o WSL2 en Windows.  

---

## Installation and Setup  

### 1. Configuración del Replica Set de MongoDB  
En tres terminales distintas:  

```bash
mongod --replSet rs0 --port 27017 --dbpath ~/mongo-rs/data1 --bind_ip 127.0.0.1
mongod --replSet rs0 --port 27018 --dbpath ~/mongo-rs/data2 --bind_ip 127.0.0.1
mongod --replSet rs0 --port 27019 --dbpath ~/mongo-rs/data3 --bind_ip 127.0.0.1
```

### 1. Inicializar Replica Set en mongosh

```bash
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "127.0.0.1:27017", priority: 2 },
    { _id: 1, host: "127.0.0.1:27018", priority: 1 },
    { _id: 2, host: "127.0.0.1:27019", priority: 0 }
  ]
})
```
### Verificar
```bash
rs.status().members.map(m => ({name:m.name, state:m.stateStr, prio:m.priority}))
```
### 2. Iniciar Redis
```bash
redis-cli -p 6379 PING
# Respuesta esperada: PONG
```
### 3. Backend
Instalar dependencias:

```bash
cd backend
npm install
```
### Levantar dos instancias del backend:

```bash
PORT=3001 SERVICE_NAME=backend1 node src/server.js
PORT=3002 SERVICE_NAME=backend2 node src/server.js
```
### Probar salud:
```bash
curl http://localhost:3001/api/health
curl http://localhost:3002/api/health
```
### 4. Nginx (Load Balancer)

### Desde carpeta nginx:
```bash
cd nginx
sudo nginx -s stop || true
sudo nginx -t -c "$(pwd)/nginx.conf" -p "$(dirname "$(pwd)")"/
sudo nginx -c "$(pwd)/nginx.conf" -p "$(dirname "$(pwd)")"/
```
### Probar round-robin:
```bash
curl http://localhost:8080/api/health
```
### Usage
Crear apuesta
```bash
curl -X POST http://localhost:8080/api/bets \
  -H "Content-Type: application/json" \
  -d '{"user":"Ana","amount":7000}'
```
### Listar apuestas
```bash
curl "http://localhost:8080/api/bets?limit=5"
```
## High Availability Tests  

### 1. Failover de Base de Datos  
1. Detener el nodo **PRIMARY**.  
2. Promover un nodo **SECONDARY** a **PRIMARY**.  
3. Verificar que nuevas apuestas se sigan almacenando en el nuevo **PRIMARY**.  

### 2. Failover de Backend  
1. Con **Nginx + Redis** activos, conectar varios clientes.  
2. Matar uno de los backends.  
3. Verificar que los clientes se reconectan automáticamente y las apuestas siguen sincronizadas.  

---

## Troubleshooting  

| Problema | Solución |
|----------|----------|
| No aparece PRIMARY en `rs.status()` | Esperar unos segundos y volver a ejecutar. |
| Redis no propaga eventos | Comprobar si `redis-server` sigue activo. |
| Error en Nginx | Revisar sintaxis con `nginx -t`. |
| WebSocket desconectado | El frontend debe reconectarse automáticamente vía balanceador. |

---

## Contributors  
- Mileth Martinez
- Oscar Gonzales
- Juan López 

