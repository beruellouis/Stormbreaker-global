const fs = require('fs');
const path = require('path');
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const eventsFile = path.join(__dirname, '..', 'events.json');
const msgIdFile = path.join(__dirname, '..', 'eventmsg_id.txt');

function loadEvents() {
    if (!fs.existsSync(eventsFile)) return [];
    return JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
}

function saveEvents(events) {
    fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2), 'utf8');
}

function buildEventsEmbed(events) {
    if (events.length === 0) {
        return new EmbedBuilder()
            .setTitle('📋 Événements Stormbreaker')
            .setDescription('Aucun événement pour l’instant.')
            .setColor(0x3498DB)
            .setTimestamp();
    }

    const fields = events.map((e, i) => {
        const participants = (e.participants || []).map(u => `<@${u}>`).join(', ') || 'Personne';
        const nonParticipants = (e.nonParticipants || []).map(u => `<@${u}>`).join(', ') || 'Aucun refus';
        return {
            name: `📌 [${i}] ${e.title} — ${e.date}`,
            value: `${e.description}\n👥 Participants : ${participants}\n🙅 Refus : ${nonParticipants}`
        };
    });

    return new EmbedBuilder()
        .setTitle('📋 Événements Stormbreaker')
        .addFields(fields)
        .setColor(0x3498DB)
        .setTimestamp();
}

module.exports = {
    name: 'event',
    description: 'Gère les événements (list, add, remove)',
    async execute(message, args) {
        const sub = args[0];
        const rest = args.slice(1);
        let events = loadEvents();

        // → LIST: envoie ou édite le message permanent
        if (!sub || sub === 'list') {
            const embed = buildEventsEmbed(events);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('refresh_events')
                    .setLabel('🔄 Rafraîchir')
                    .setStyle(ButtonStyle.Secondary)
            );
            // Récupère l'ID si déjà envoyé
            let msgId = fs.existsSync(msgIdFile)
                ? fs.readFileSync(msgIdFile, 'utf8').trim()
                : null;

            const ch = message.channel;
            let msg = null;
            if (msgId) {
                msg = await ch.messages.fetch(msgId).catch(() => null);
            }
            if (msg) {
                await msg.edit({ embeds: [embed], components: [row] });
            } else {
                msg = await ch.send({ embeds: [embed], components: [row] });
                fs.writeFileSync(msgIdFile, msg.id, 'utf8');
            }
            return;
        }

        // → ADD
        if (sub === 'add') {
            if (!message.member.roles.cache.some(r => r.name === 'E-5')) {
                return message.reply('🚫 Tu dois avoir le rôle E-5.');
            }
            const parts = rest.join(' ').split('|').map(s => s.trim());
            if (parts.length < 3) {
                return message.reply('❌ Format : `!event add Titre | Date | Description`');
            }
            const [title, date, description] = parts;
            events.push({ title, date, description, participants: [], nonParticipants: [] });
            saveEvents(events);
            await message.channel.send(`📢 Événement **${title}** ajouté !`);
            return;
        }

        // → REMOVE
        if (sub === 'remove') {
            if (!message.member.roles.cache.some(r => r.name === 'E-5')) {
                return message.reply('🚫 Tu dois avoir le rôle E-5.');
            }
            const idx = parseInt(rest[0], 10);
            if (isNaN(idx) || idx < 0 || idx >= events.length) {
                return message.reply('❌ ID invalide.');
            }
            const removed = events.splice(idx, 1)[0];
            saveEvents(events);
            return message.channel.send(`🗑️ Événement **${removed.title}** supprimé.`);
        }

        return message.reply('❌ Sous-commande inconnue. Utilise `list`, `add`, ou `remove`.');
    }
};
