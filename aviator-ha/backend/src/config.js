export const cfg = {
  PORT: parseInt(process.env.PORT || "3001", 10),
  SERVICE_NAME: process.env.SERVICE_NAME || "backend1",
  MONGO_URI:
    process.env.MONGO_URI ||
    "mongodb://127.0.0.1:27017,127.0.0.1:27018,127.0.0.1:27019/aviator?replicaSet=rs0",
  REDIS_HOST: process.env.REDIS_HOST || "127.0.0.1",
  REDIS_PORT: parseInt(process.env.REDIS_PORT || "6379", 10)
};
