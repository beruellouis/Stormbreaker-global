module.exports = {
    name: 'ping',
    description: 'Répond avec la latence',
    async execute(message) {
        const sent = await message.channel.send('🏓 Ping...');
        sent.edit(`🏓 Pong ! Latence : ${sent.createdTimestamp - message.createdTimestamp}ms`);
    }
};