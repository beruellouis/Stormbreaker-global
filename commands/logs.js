const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'logs',
    description: 'Affiche les dernières actions enregistrées',
    async execute(message) {
        const logsPath = path.join(__dirname, '..', 'logs.json');

        if (!fs.existsSync(logsPath)) {
            return message.reply('❌ Aucun log trouvé.');
        }

        const logs = JSON.parse(fs.readFileSync(logsPath));
        if (logs.length === 0) {
            return message.reply('📭 Le journal est vide.');
        }

        const latestLogs = logs.slice(-10).reverse(); // 10 dernières entrées
        const embed = new EmbedBuilder()
            .setTitle('📜 Dernières actions')
            .setColor(0x2f3136)
            .setTimestamp();

        latestLogs.forEach(log => {
            embed.addFields({
                name: `🕒 ${new Date(log.timestamp).toLocaleString()}`,
                value: `👤 **${log.username}** (${log.userId})\n✏️ ${log.action}`
            });
        });

        return message.channel.send({ embeds: [embed] });
    }
};
