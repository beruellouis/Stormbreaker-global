const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const banquePath = path.join(__dirname, '..', 'banque.json');

function getBanque() {
    if (!fs.existsSync(banquePath)) {
        return { total: 0, transactions: [], donateurs: {} };
    }
    return JSON.parse(fs.readFileSync(banquePath, 'utf8'));
}

function formatAUEC(amount) {
    return `${Number(amount).toLocaleString()} aUEC`;
}

module.exports = {
    name: 'banque',
    description: 'Affiche le statut de la banque Stormbreaker',
    async execute(message) {
        const banque = getBanque();
        const top = Object.entries(banque.donateurs)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([id, amt], i) => `${i + 1}. <@${id}> — ${formatAUEC(amt)}`)
            .join('\n') || 'Aucun donateur.';

        const embed = {
            title: '🏦 Banque Stormbreaker',
            description: `💰 Total actuel : **${formatAUEC(banque.total)}**\n\n👑 Top donateurs :\n${top}`,
            color: 0x2ecc71
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('open_donation_modal')
                .setLabel('💸 Proposer un don')
                .setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
    }
};
