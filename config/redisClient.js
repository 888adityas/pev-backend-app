
const redis = require('redis');
// Create a Redis client
const redisClient = redis.createClient({
    // Redis configuration options
    host: process.env.REDIS_HOST, // Redis server hostname
    port: process.env.REDIS_PORT, // Redis server port
    // Add any other options you need
});

redisClient.connect().catch(console.error);

module.exports = redisClient;