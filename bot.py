import discord
from discord.ext import commands
from discord.ui import Button, Select, View
import os
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv("DISCORD_TOKEN")

# Définir les intents nécessaires
intents = discord.Intents.default()
intents.message_content = True  # Nécessaire pour lire le contenu des messages
intents.members = True  # Nécessaire pour obtenir des informations sur les membres
intents.messages = True  # Nécessaire pour recevoir les événements de messages (comme la suppression de messages)

bot = commands.Bot(command_prefix="!", intents=intents)

# ----- IDs des salons et rôles -----
CATEGORY_NAME = "Support"  # Nom de la catégorie des tickets
STAFF_ROLE_ID = 1366951587288846397  # ID du rôle Staff
WELCOME_CHANNEL_ID = 1298738614850555954  # ID du salon de bienvenue
TICKET_REQUEST_CHANNEL_ID = 1366953530597834792  # ID du salon pour demander un ticket
LOG_CHANNEL_ID = 1366957862709891082  # ID du salon de logs pour les événements et messages supprimés
NEW_MEMBER_ROLE_NAME = "Nouveaux"  # Nom du rôle à ajouter automatiquement aux nouveaux membres

# ----- UI des tickets -----

class TicketSelect(Select):
    def __init__(self):
        options = [
            discord.SelectOption(label="Problème technique", description="Assistance pour bugs.", emoji="🖥️"),
            discord.SelectOption(label="Demande d'information", description="Question générale.", emoji="❓"),
            discord.SelectOption(label="Problème de compte", description="Compte bloqué ou erreur.", emoji="🔑"),
        ]
        super().__init__(placeholder="Choisissez un type de ticket...", min_values=1, max_values=1, options=options)

    async def callback(self, interaction: discord.Interaction):
        selected = self.values[0]
        category = discord.utils.get(interaction.guild.categories, name=CATEGORY_NAME)

        if category:
            overwrites = {
                interaction.guild.default_role: discord.PermissionOverwrite(read_messages=False),
                interaction.user: discord.PermissionOverwrite(read_messages=True, send_messages=True),
                interaction.guild.get_role(STAFF_ROLE_ID): discord.PermissionOverwrite(read_messages=True, send_messages=True)
            }

            channel = await interaction.guild.create_text_channel(
                name=f"ticket-{interaction.user.name}",
                category=category,
                overwrites=overwrites
            )

            # Enregistrement dans les logs
            log_channel = bot.get_channel(LOG_CHANNEL_ID)
            embed = discord.Embed(
                title="Ticket créé",
                description=f"**Utilisateur :** {interaction.user.mention}\n**Type de ticket :** {selected}",
                color=discord.Color.green()
            )
            await log_channel.send(embed=embed)

            await channel.send(
                f"{interaction.user.mention}, votre ticket a été créé pour : **{selected}**.\nUn membre du staff vous répondra bientôt."
            )
            await interaction.response.send_message("Votre ticket a été créé avec succès.", ephemeral=True)
            
            # Ajouter le bouton de fermeture du ticket
            await channel.send(view=CloseTicketButton())
        else:
            await interaction.response.send_message("Erreur : la catégorie 'Support' est introuvable.", ephemeral=True)

class TicketButton(View):
    def __init__(self):
        super().__init__()

    @discord.ui.button(label="🎫 Créer un ticket", style=discord.ButtonStyle.green)
    async def create_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        view = View()
        view.add_item(TicketSelect())
        await interaction.response.send_message("Veuillez choisir le type de ticket :", view=view, ephemeral=True)

class CloseTicketButton(View):
    def __init__(self):
        super().__init__()

    @discord.ui.button(label="❌ Fermer le ticket", style=discord.ButtonStyle.red)
    async def close_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        ticket_channel = interaction.channel
        if STAFF_ROLE_ID in [role.id for role in interaction.user.roles]:  # Vérification du rôle Staff
            await ticket_channel.delete()
            await interaction.response.send_message("Le ticket a été fermé.", ephemeral=True)

# ----- Events -----

@bot.event
async def on_ready():
    print(f"{bot.user} est connecté.")
    
    # Envoie automatique du bouton de ticket dans le salon défini
    channel = bot.get_channel(TICKET_REQUEST_CHANNEL_ID)
    if channel:
        await channel.send("Clique sur le bouton ci-dessous pour créer un ticket :", view=TicketButton())
    else:
        print(f"Erreur : salon ID {TICKET_REQUEST_CHANNEL_ID} introuvable.")

@bot.event
async def on_member_join(member):
    # 🔹 Ajout du rôle automatiquement
    role = discord.utils.get(member.guild.roles, name=NEW_MEMBER_ROLE_NAME)
    if role:
        await member.add_roles(role)
        print(f"Rôle '{role.name}' ajouté à {member.name}.")
    else:
        print("❌ Rôle 'Nouveaux' introuvable.")

    # 🔹 Log dans le salon de logs
    log_channel = bot.get_channel(LOG_CHANNEL_ID)
    embed = discord.Embed(
        title="Nouveau membre",
        description=f"**Membre :** {member.mention}\n**Nom :** {member.name}",
        color=discord.Color.green()
    )
    await log_channel.send(embed=embed)

    # 🔹 Message de bienvenue dans le salon de bienvenue
    channel = bot.get_channel(WELCOME_CHANNEL_ID)
    if channel:
        embed = discord.Embed(
            title=f"Bienvenue {member.name} ! 🎉",
            description=f"Nous sommes ravis de t'accueillir parmi nous, {member.mention} !",
            color=discord.Color.blue()
        )
        embed.set_image(url="https://i.ibb.co/ZpCDj4WK/Chat-GPT-Image-1-avr-2025-16-21-38-jpg.jpg")
        embed.set_footer(text="N'oublie pas de lire les règles et de te présenter !")
        await channel.send(embed=embed)
    else:
        print(f"Erreur : salon ID {WELCOME_CHANNEL_ID} introuvable.")

@bot.event
async def on_message_delete(message):
    log_channel = bot.get_channel(LOG_CHANNEL_ID)
    if message.author != bot.user:
        embed = discord.Embed(
            title="Message supprimé",
            description=f"**Utilisateur :** {message.author.mention}\n**Message :** {message.content}",
            color=discord.Color.red()
        )
        embed.set_footer(text=f"Salon : {message.channel.name}")
        await log_channel.send(embed=embed)

# ----- Commandes -----

@bot.command()
async def ticket(ctx):
    """Commande manuelle pour renvoyer le bouton"""
    await ctx.send("Clique sur le bouton ci-dessous pour créer un ticket :", view=TicketButton())

@bot.command()
async def ping(ctx):
    await ctx.send(f"Pong! Latence : {round(bot.latency * 1000)}ms")

@bot.command()
async def testbutton(ctx):
    await ctx.send("Test de bouton :", view=TicketButton())

bot.run(TOKEN)
