const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  REST,
  Routes,
  ThreadAutoArchiveDuration,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const fs   = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID;

// Channels
const LEAGUE_CHANNEL_ID      = '1494706706549047356';
const GUIDELINES_CHANNEL_ID  = '1494316420228714506';
const LEAGUE_INFO_CHANNEL_ID = '1494707704021778443';
const EVENT_CHANNEL_ID       = '1494729750785032344';
const GENERAL_CHAT_ID        = '1494270116148412418';

// Roles
const LEAGUES_PING_ROLE_ID   = '1494342656845680751';
const LEAGUE_HOST_ROLE_ID    = '1494366881916653690';
const HEAD_OF_EVENTS_ROLE_ID = '1495436092470460596';
const GIVEAWAY_PING_ROLE_ID  = '1494342597840474193';

// ─── Database ─────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'database.json');

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const init = { leagues: {}, warns: {}, events: {} };
      fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2));
      return init;
    }
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!db.events) db.events = {};
    return db;
  } catch {
    return { leagues: {}, warns: {}, events: {} };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getMaxPlayers(format) {
  return { '2v2': 4, '3v3': 6, '4v4': 8 }[format] ?? 4;
}

const FORMAT_LABEL = { '2v2': '2v2', '3v3': '3v3', '4v4': '4v4' };
const TYPE_LABEL   = { swift: 'Swift Game', war: 'War Game' };
const PERKS_LABEL  = { perks: 'Perks', no_perks: 'No Perks' };
const REGION_LABEL = {
  europe: 'Europe', asia: 'Asia',
  north_america: 'North America', south_america: 'South America', oceania: 'Oceania',
};

function buildLeagueEmbed(league, guild) {
  const host      = guild.members.cache.get(league.host_id);
  const hostName  = host ? host.user.username : 'Unknown';
  const maxP      = league.max_players;
  const spotsLeft = maxP - league.players.length;

  return new EmbedBuilder()
    .setTitle('League Available')
    .setColor(0x1a1a2e)
    .addFields(
      { name: 'Format',     value: FORMAT_LABEL[league.format],   inline: true },
      { name: 'Match Type', value: TYPE_LABEL[league.type],       inline: true },
      { name: 'Perks',      value: PERKS_LABEL[league.perks],     inline: true },
      { name: 'Region',     value: REGION_LABEL[league.region],   inline: true },
      { name: 'Host',       value: hostName,                       inline: true },
      { name: 'Spots Left', value: `${spotsLeft} / ${maxP}`,      inline: true },
      {
        name:   'Players',
        value:  league.players.length > 0
                  ? league.players.map(id => `<@${id}>`).join('  ')
                  : 'None yet',
        inline: false,
      },
      { name: 'League ID', value: `\`${league.id}\``, inline: true },
    )
    .setFooter({ text: `Join: /league join id:${league.id}  |  Cancel: /league cancel id:${league.id}` })
    .setTimestamp();
}

function buildEventButtons(eventId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`event_start_${eventId}`)
      .setLabel('Start Event')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`event_cancel_${eventId}`)
      .setLabel('Cancel Event')
      .setStyle(ButtonStyle.Danger),
  );
}

// ─── Slash Commands ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('league')
    .setDescription('League management')
    .addSubcommand(sub =>
      sub.setName('host').setDescription('Host a new league')
        .addStringOption(opt => opt.setName('format').setDescription('Match format').setRequired(true)
          .addChoices({ name: '2v2', value: '2v2' }, { name: '3v3', value: '3v3' }, { name: '4v4', value: '4v4' }))
        .addStringOption(opt => opt.setName('type').setDescription('Match type').setRequired(true)
          .addChoices({ name: 'Swift Game', value: 'swift' }, { name: 'War Game', value: 'war' }))
        .addStringOption(opt => opt.setName('perks').setDescription('Match perks').setRequired(true)
          .addChoices({ name: 'Perks', value: 'perks' }, { name: 'No Perks', value: 'no_perks' }))
        .addStringOption(opt => opt.setName('region').setDescription('Region').setRequired(true)
          .addChoices(
            { name: 'Europe', value: 'europe' }, { name: 'Asia', value: 'asia' },
            { name: 'North America', value: 'north_america' },
            { name: 'South America', value: 'south_america' },
            { name: 'Oceania', value: 'oceania' },
          )))
    .addSubcommand(sub =>
      sub.setName('join').setDescription('Join an open league')
        .addStringOption(opt => opt.setName('id').setDescription('League ID').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('cancel').setDescription('Cancel a league you are hosting')
        .addStringOption(opt => opt.setName('id').setDescription('League ID to cancel').setRequired(true))),

  new SlashCommandBuilder()
    .setName('guidelines')
    .setDescription('Post server guidelines in the guidelines channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('leagueinfo')
    .setDescription('Post league information in the league information channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('hostevent')
    .setDescription('Host a server event')
    .addSubcommand(sub =>
      sub.setName('guessthenumber').setDescription('Host a Guess the Number event')
        .addStringOption(opt => opt.setName('funder').setDescription('Who is funding the event?').setRequired(true))
        .addStringOption(opt => opt.setName('prize').setDescription('What is the prize?').setRequired(true))
        .addIntegerOption(opt => opt.setName('min').setDescription('Minimum number of the range (e.g. 1)').setRequired(true).setMinValue(1))
        .addIntegerOption(opt => opt.setName('max').setDescription('Maximum number of the range (e.g. 1000)').setRequired(true).setMinValue(2)))
    .addSubcommand(sub =>
      sub.setName('roblox').setDescription('Host a Roblox event')
        .addStringOption(opt => opt.setName('host').setDescription('Who is hosting the event?').setRequired(true))
        .addStringOption(opt => opt.setName('funder').setDescription('Who is funding the event?').setRequired(true))
        .addStringOption(opt => opt.setName('prize').setDescription('What is the prize?').setRequired(true))
        .addStringOption(opt => opt.setName('serverlink').setDescription('Roblox private server link').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('custom').setDescription('Host a custom event')
        .addStringOption(opt => opt.setName('name').setDescription('Name of the event').setRequired(true))
        .addStringOption(opt => opt.setName('howitworks').setDescription('How does the event work?').setRequired(true))
        .addStringOption(opt => opt.setName('host').setDescription('Who is hosting?').setRequired(true))
        .addStringOption(opt => opt.setName('funder').setDescription('Who is funding?').setRequired(true))
        .addStringOption(opt => opt.setName('prize').setDescription('What is the prize?').setRequired(true))),

  new SlashCommandBuilder()
    .setName('endevent')
    .setDescription('End an active event and unlock general chat')
    .addStringOption(opt => opt.setName('id').setDescription('Event ID').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warns')
    .setDescription('Check warns for a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to check (leave empty for yourself)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Clear all warns for a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt => opt.setName('user').setDescription('User to clear warns for').setRequired(true)),
];

// ─── Client ───────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
});

// ─── Ready ────────────────────────────────────────────────────────────────────
client.once('clientReady', async () => {
  console.log(`[BOT] Logged in as ${client.user.tag}`);
  if (!CLIENT_ID || !GUILD_ID) {
    console.warn('[BOT] CLIENT_ID or GUILD_ID not set — skipping command registration.');
    return;
  }
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands.map(c => c.toJSON()) });
    console.log('[BOT] Slash commands registered.');
  } catch (err) {
    console.error('[BOT] Failed to register commands:', err);
  }
});

// ─── Interactions ─────────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {

  // ── Button Interactions ───────────────────────────────────────────────────
  if (interaction.isButton()) {
    const parts   = interaction.customId.split('_');
    const prefix  = parts[0];
    const action  = parts[1];
    const eventId = parts[2];

    if (prefix !== 'event') return;

    const db    = loadDB();
    const event = db.events[eventId];

    if (!event) return interaction.reply({ content: 'Event not found.', ephemeral: true });
    if (interaction.user.id !== event.host_id) {
      return interaction.reply({ content: 'Only the event host can use these buttons.', ephemeral: true });
    }

    // ── Start ──────────────────────────────────────────────────────────────
    if (action === 'start') {
      if (event.status !== 'pending') {
        return interaction.reply({ content: 'This event has already been started or cancelled.', ephemeral: true });
      }

      await interaction.deferUpdate();

      event.status = 'active';
      saveDB(db);

      await interaction.message.edit({ components: [] }).catch(() => {});

      const eventChannel = await client.channels.fetch(EVENT_CHANNEL_ID).catch(() => null);
      if (eventChannel) {
        let announcementEmbed;

        if (event.type === 'guessthenumber') {
          announcementEmbed = new EmbedBuilder()
            .setTitle('Guess the Number — Event Active')
            .setColor(0x1a1a2e)
            .setDescription(
              '**How Does the Event Work?**\n\n' +
              'In this event, you will try to guess a randomly selected number within the given range.\n' +
              'The first person to guess the correct number wins the prize for this event!\n\n' +
              'You cannot say more than 2 numbers at once.'
            )
            .addFields(
              { name: 'Host',           value: `<@${event.host_id}>`,        inline: true },
              { name: 'Funder',         value: event.funder,                  inline: true },
              { name: 'Prize',          value: event.prize,                   inline: true },
              { name: 'Range',          value: `${event.min} — ${event.max}`, inline: true },
              { name: 'Participate In', value: `<#${GENERAL_CHAT_ID}>`,       inline: true },
              { name: 'Event ID',       value: `\`${eventId}\``,              inline: true },
            )
            .setTimestamp();

        } else if (event.type === 'roblox') {
          announcementEmbed = new EmbedBuilder()
            .setTitle('Roblox Event — Active')
            .setColor(0x1a1a2e)
            .setDescription('A Roblox event has started! Join using the server link below.')
            .addFields(
              { name: 'Host',         value: event.host_name,    inline: true },
              { name: 'Funder',       value: event.funder,       inline: true },
              { name: 'Prize',        value: event.prize,        inline: true },
              { name: 'Server Link',  value: event.serverlink,   inline: false },
              { name: 'Event ID',     value: `\`${eventId}\``,   inline: true },
            )
            .setTimestamp();

        } else if (event.type === 'custom') {
          announcementEmbed = new EmbedBuilder()
            .setTitle(`${event.event_name} — Active`)
            .setColor(0x1a1a2e)
            .setDescription(`**How Does the Event Work?**\n\n${event.howitworks}`)
            .addFields(
              { name: 'Host',     value: event.host_name,   inline: true },
              { name: 'Funder',   value: event.funder,      inline: true },
              { name: 'Prize',    value: event.prize,       inline: true },
              { name: 'Event ID', value: `\`${eventId}\``,  inline: true },
            )
            .setTimestamp();
        }

        if (announcementEmbed) {
          await eventChannel.send({
            content: `@here <@&${GIVEAWAY_PING_ROLE_ID}>`,
            embeds:  [announcementEmbed],
            allowedMentions: { parse: ['everyone'], roles: [GIVEAWAY_PING_ROLE_ID] },
          });
        }
      }

      return;
    }

    // ── Cancel ─────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      if (event.status !== 'pending') {
        return interaction.reply({ content: 'This event has already been started or cancelled.', ephemeral: true });
      }

      await interaction.deferUpdate();
      event.status = 'cancelled';
      saveDB(db);

      await interaction.message.edit({
        content:    `Event \`${eventId}\` has been cancelled.`,
        embeds:     [],
        components: [],
      }).catch(() => {});

      return;
    }

    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // ── /league ──────────────────────────────────────────────────────────────
  if (commandName === 'league') {
    const sub = interaction.options.getSubcommand();

    // ── host ────────────────────────────────────────────────────────────
    if (sub === 'host') {
      if (!interaction.member.roles.cache.has(LEAGUE_HOST_ROLE_ID)) {
        return interaction.reply({ content: 'You do not have the required role to host leagues.', ephemeral: true });
      }
      if (interaction.channelId !== LEAGUE_CHANNEL_ID) {
        return interaction.reply({ content: `Leagues must be hosted in <#${LEAGUE_CHANNEL_ID}>.`, ephemeral: true });
      }

      await interaction.deferReply();

      const format     = interaction.options.getString('format');
      const type       = interaction.options.getString('type');
      const perks      = interaction.options.getString('perks');
      const region     = interaction.options.getString('region');
      const leagueId   = generateId();
      const maxPlayers = getMaxPlayers(format);

      const league = {
        id: leagueId, host_id: interaction.user.id,
        format, type, perks, region,
        players: [interaction.user.id], max_players: maxPlayers,
        message_id: null, thread_id: null,
        status: 'open', created_at: Date.now(),
      };

      const db = loadDB();
      db.leagues[leagueId] = league;
      saveDB(db);

      const msg = await interaction.editReply({
        content: `<@&${LEAGUES_PING_ROLE_ID}>`,
        embeds:  [buildLeagueEmbed(league, interaction.guild)],
      });

      let thread = null;
      try {
        thread = await interaction.channel.threads.create({
          name:                `League ${leagueId} | ${FORMAT_LABEL[format]} ${TYPE_LABEL[type]}`,
          type:                ChannelType.PrivateThread,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
          invitable:           false,
          reason:              `Private thread for league ${leagueId}`,
        });

        await thread.members.add(interaction.user.id);

        const threadEmbed = new EmbedBuilder()
          .setTitle('Private League Thread')
          .setColor(0x1a1a2e)
          .setDescription(
            `This private thread is for league \`${leagueId}\`. Players who join the league will be added here automatically.`
          )
          .addFields(
            { name: 'Join Command',   value: `\`/league join id:${leagueId}\``,   inline: false },
            { name: 'Cancel Command', value: `\`/league cancel id:${leagueId}\``, inline: false },
          )
          .setTimestamp();

        await thread.send({ content: `<@${interaction.user.id}>`, embeds: [threadEmbed] });
      } catch (err) {
        console.error('[THREAD] Failed to create private thread:', err.message);
      }

      const dbUpd = loadDB();
      dbUpd.leagues[leagueId].message_id = msg.id;
      dbUpd.leagues[leagueId].thread_id  = thread ? thread.id : null;
      saveDB(dbUpd);

      return;
    }

    // ── join ────────────────────────────────────────────────────────────
    if (sub === 'join') {
      const leagueId = interaction.options.getString('id').trim().toUpperCase();
      const db       = loadDB();
      const league   = db.leagues[leagueId];

      if (!league || league.status === 'cancelled') {
        return interaction.reply({ content: 'League not found or has been cancelled.', ephemeral: true });
      }
      if (league.status === 'full') {
        return interaction.reply({ content: 'This league is already full.', ephemeral: true });
      }
      if (league.players.includes(interaction.user.id)) {
        return interaction.reply({ content: 'You have already joined this league.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      league.players.push(interaction.user.id);
      if (league.players.length >= league.max_players) league.status = 'full';
      saveDB(db);

      if (league.thread_id) {
        try {
          const thread = await interaction.guild.channels.fetch(league.thread_id);
          if (thread) {
            await thread.members.add(interaction.user.id);
            await thread.send({ content: `<@${interaction.user.id}> has joined the league.` });
            if (league.status === 'full') {
              await thread.send({ content: 'The league is now full. All players have been added. Good luck.' });
            }
          }
        } catch (err) {
          console.error('[THREAD] Failed to add member to thread:', err.message);
        }
      }

      try {
        const leagueChannel = await interaction.guild.channels.fetch(LEAGUE_CHANNEL_ID);
        if (leagueChannel && league.message_id) {
          const msg = await leagueChannel.messages.fetch(league.message_id);
          if (msg) await msg.edit({ embeds: [buildLeagueEmbed(league, interaction.guild)] });
        }
      } catch (err) {
        console.error('[EMBED] Failed to update league embed:', err.message);
      }

      return interaction.editReply({
        content: `You have joined league \`${leagueId}\`. You have been added to the private league thread.`,
      });
    }

    // ── cancel ──────────────────────────────────────────────────────────
    if (sub === 'cancel') {
      const leagueId = interaction.options.getString('id').trim().toUpperCase();
      const db       = loadDB();
      const league   = db.leagues[leagueId];

      if (!league) {
        return interaction.reply({ content: 'League not found.', ephemeral: true });
      }
      if (!interaction.member.roles.cache.has(LEAGUE_HOST_ROLE_ID) && league.host_id !== interaction.user.id) {
        return interaction.reply({ content: 'You can only cancel a league you are hosting.', ephemeral: true });
      }
      if (league.status === 'cancelled') {
        return interaction.reply({ content: 'This league is already cancelled.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      league.status = 'cancelled';
      saveDB(db);

      try {
        const leagueChannel = await interaction.guild.channels.fetch(LEAGUE_CHANNEL_ID);
        if (leagueChannel && league.message_id) {
          const msg = await leagueChannel.messages.fetch(league.message_id);
          if (msg) {
            const cancelEmbed = new EmbedBuilder()
              .setTitle('League Cancelled')
              .setColor(0x8b0000)
              .setDescription(`League \`${leagueId}\` has been cancelled by <@${interaction.user.id}>.`)
              .addFields(
                { name: 'Format',     value: FORMAT_LABEL[league.format],  inline: true },
                { name: 'Match Type', value: TYPE_LABEL[league.type],      inline: true },
                { name: 'Region',     value: REGION_LABEL[league.region],  inline: true },
              )
              .setTimestamp();
            await msg.edit({ content: '', embeds: [cancelEmbed] });
          }
        }
      } catch (err) {
        console.error('[EMBED] Failed to update cancelled embed:', err.message);
      }

      if (league.thread_id) {
        try {
          const thread = await interaction.guild.channels.fetch(league.thread_id);
          if (thread) {
            await thread.send({
              content: `This league has been cancelled by <@${interaction.user.id}>. The thread will now be archived.`,
            });
            await thread.setArchived(true);
          }
        } catch (err) {
          console.error('[THREAD] Failed to archive thread:', err.message);
        }
      }

      return interaction.editReply({ content: `League \`${leagueId}\` has been cancelled.` });
    }
  }

  // ── /guidelines ───────────────────────────────────────────────────────────
  if (commandName === 'guidelines') {
    await interaction.deferReply({ ephemeral: true });

    const channel = await interaction.guild.channels.fetch(GUIDELINES_CHANNEL_ID).catch(() => null);
    if (!channel) return interaction.editReply({ content: 'Guidelines channel not found.' });

    const embeds = [
      new EmbedBuilder().setTitle('Section I: The FCD Code of Conduct').setColor(0x1a1a2e)
        .setDescription(
          'Our goal is to build the best MVSD community on Discord. This requires everyone to act with common sense and basic decency. Any behavior that ruins the fun for others — whether through saltiness, ego, or genuine malice — has no place here. We expect you to keep the vibes high and the competition clean.\n\n' +
          '**External Links:**\nhttps://discord.com/terms\nhttps://discord.com/guidelines'
        ),
      new EmbedBuilder().setTitle('Section II: Respect & Interaction').setColor(0x1a1a2e)
        .setDescription('» **Keep it Civil:** We do not care how good you are at the game; if you are toxic, you are out. This includes any form of racism, slurs, or bullying. Trash talk is part of the game, but keep it focused on the match — never make it personal or identity-based.'),
      new EmbedBuilder().setTitle('Section III: Privacy & Safety First').setColor(0x1a1a2e)
        .setDescription('» **No Leaks:** Your online life stays online. Attempting to find or share anyone\'s real-world name, location, or private photos (doxing) is the fastest way to get banned. We have zero patience for anyone who threatens the safety of our members.'),
      new EmbedBuilder().setTitle('Section IV: Server Cleanliness').setColor(0x1a1a2e)
        .setDescription('» **Keep it SFW:** We are a gaming community, not a place for adult content. Posting NSFW images, links, or having overly graphic conversations is strictly prohibited. If you would not show it to a younger sibling, do not post it here.'),
      new EmbedBuilder().setTitle('Section V: Promotion & Scams').setColor(0x1a1a2e)
        .setDescription('» **No Unauthorized Ads:** Do not join just to DM our members your own server links or cheap gem scams. We consider this predatory. If you want to partner with FCD, go through the proper staff channels. Spamming, whether in channels or DMs, will be handled by our auto-mod immediately.'),
      new EmbedBuilder().setTitle('Section VI: Leadership & Disputes').setColor(0x1a1a2e)
        .setDescription('» **Staff Decisions:** Our moderators are here to keep the server running. Their word is final in any dispute. If you disagree with a warn or a mute, take it to a private ticket — do not start a scene in the general chat. Disrupting the server to argue with staff will result in a kick.'),
      new EmbedBuilder().setTitle('Section VII: Your Account, Your Risk').setColor(0x1a1a2e)
        .setDescription('» **No Excuses:** You are the only person who should have access to your account. If your friend gets you banned while on your computer, the ban stays. Additionally, using alts to dodge a punishment is a permanent, non-appealable offense for your main account and your IP.'),
    ];

    try { await channel.bulkDelete(100); } catch { /* messages may be too old */ }
    for (const embed of embeds) await channel.send({ embeds: [embed] });

    return interaction.editReply({ content: 'Guidelines posted successfully.' });
  }

  // ── /leagueinfo ───────────────────────────────────────────────────────────
  if (commandName === 'leagueinfo') {
    await interaction.deferReply({ ephemeral: true });

    const channel = await interaction.guild.channels.fetch(LEAGUE_INFO_CHANNEL_ID).catch(() => null);
    if (!channel) return interaction.editReply({ content: 'League information channel not found.' });

    const embeds = [
      new EmbedBuilder()
        .setTitle('League Information')
        .setColor(0x1a1a2e)
        .setDescription(
          'All information below must be followed. Everything is explained in detail to ensure clarity and understanding. ' +
          'Please read to the end to avoid misunderstandings and punishment.\n\n' +
          '**League Gameplay — Series in Order:**\n' +
          `Once a <@&${LEAGUE_HOST_ROLE_ID}> starts match marking, click the join league button and you will be redirected to a thread where the private server link will be posted.\n\n` +
          `Join the match with the links and follow all instructions from the <@&${LEAGUE_HOST_ROLE_ID}>.`
        ),

      new EmbedBuilder()
        .setTitle('Swift League — Gameplay & Marking')
        .setColor(0x1a1a2e)
        .setDescription(
          'Swift league allows unlimited matches and each will be marked separately.\n\n' +
          `Screenshots will be posted in <#1494707660631572551> with pings to all players who participated.`
        ),

      new EmbedBuilder()
        .setTitle('War League — Gameplay & Marking')
        .setColor(0x1a1a2e)
        .setDescription(
          `War game, unlike Swift, War Leagues are played as a series — either BO3 (First to 2) or BO5 (First to 3). The same teams are kept throughout.\n\n` +
          `<@&${LEAGUE_HOST_ROLE_ID}> must calculate Kills and Deaths for each player, then post the K/D ratios with pings to both teams.`
        ),

      new EmbedBuilder()
        .setTitle('War League Statistics')
        .setColor(0x1a1a2e)
        .addFields(
          { name: 'Top Performer',        value: 'Player with the highest K/D overall.',               inline: false },
          { name: 'Top on Opposing Team', value: 'Player with the highest K/D on the opposing team.',  inline: false },
        ),

      new EmbedBuilder()
        .setTitle('Commands')
        .setColor(0x1a1a2e)
        .setDescription(
          'Use `/league` to host a league.\n\n' +
          'To end a league, use `/league cancel id:<league_id>` inside the thread so it can close and the match can end.'
        ),
    ];

    try { await channel.bulkDelete(100); } catch { /* messages may be too old */ }
    for (const embed of embeds) await channel.send({ embeds: [embed] });

    return interaction.editReply({ content: 'League information posted successfully.' });
  }

  // ── /hostevent ────────────────────────────────────────────────────────────
  if (commandName === 'hostevent') {
    if (!interaction.member.roles.cache.has(HEAD_OF_EVENTS_ROLE_ID)) {
      return interaction.reply({ content: 'You do not have the required role to host events.', ephemeral: true });
    }
    if (interaction.channelId !== EVENT_CHANNEL_ID) {
      return interaction.reply({ content: `Events must be hosted from <#${EVENT_CHANNEL_ID}>.`, ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'guessthenumber') {
      const funder = interaction.options.getString('funder');
      const prize  = interaction.options.getString('prize');
      const min    = interaction.options.getInteger('min');
      const max    = interaction.options.getInteger('max');

      if (min >= max) {
        return interaction.reply({ content: 'The minimum must be less than the maximum.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const eventId      = generateId();
      const secretNumber = Math.floor(Math.random() * (max - min + 1)) + min;

      const event = {
        id:            eventId,
        type:          'guessthenumber',
        host_id:       interaction.user.id,
        funder,
        prize,
        min,
        max,
        secret_number: secretNumber,
        status:        'pending',
        winner_id:     null,
        created_at:    Date.now(),
      };

      const db = loadDB();
      db.events[eventId] = event;
      saveDB(db);

      // DM the host the secret number and event ID
      try {
        await interaction.user.send({
          content: [
            `**Event Created — \`${eventId}\`**`,
            '',
            `Secret Number: **${secretNumber}**`,
            `Range: ${min} — ${max}`,
            `Prize: ${prize}`,
            '',
            `Use \`/endevent id:${eventId}\` when you are ready to officially end the event and unlock general chat.`,
          ].join('\n'),
        });
      } catch {
        console.warn('[EVENT] Could not DM host.');
      }

      // Post the staging message in the event channel (visible to everyone)
      const stagingEmbed = new EmbedBuilder()
        .setTitle('Guess the Number — Event Pending')
        .setColor(0x1a1a2e)
        .setDescription('An event is being prepared. The host will start it shortly.')
        .addFields(
          { name: 'Host',    value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Funder',  value: funder,                       inline: true },
          { name: 'Prize',   value: prize,                        inline: true },
          { name: 'Range',   value: `${min} — ${max}`,            inline: true },
          { name: 'Event ID', value: `\`${eventId}\``,            inline: true },
        )
        .setTimestamp();

      const eventChannel = await interaction.guild.channels.fetch(EVENT_CHANNEL_ID).catch(() => null);
      if (eventChannel) {
        await eventChannel.send({
          embeds:     [stagingEmbed],
          components: [buildEventButtons(eventId)],
        });
      }

      return interaction.editReply({
        content: `Event \`${eventId}\` has been created. Check your DMs for the secret number. Use the buttons in <#${EVENT_CHANNEL_ID}> to start or cancel.`,
      });
    }

    // ── Roblox Event ────────────────────────────────────────────────────────
    if (sub === 'roblox') {
      const host       = interaction.options.getString('host');
      const funder     = interaction.options.getString('funder');
      const prize      = interaction.options.getString('prize');
      const serverlink = interaction.options.getString('serverlink');

      await interaction.deferReply({ ephemeral: true });

      const eventId = generateId();

      const event = {
        id:         eventId,
        type:       'roblox',
        host_id:    interaction.user.id,
        host_name:  host,
        funder,
        prize,
        serverlink,
        status:     'pending',
        winner_id:  null,
        created_at: Date.now(),
      };

      const db = loadDB();
      db.events[eventId] = event;
      saveDB(db);

      try {
        await interaction.user.send({
          content: `**Roblox Event Created — \`${eventId}\`**\n\nUse \`/endevent id:${eventId}\` when the event is done.`,
        });
      } catch { console.warn('[EVENT] Could not DM host.'); }

      const stagingEmbed = new EmbedBuilder()
        .setTitle('Roblox Event — Pending')
        .setColor(0x1a1a2e)
        .setDescription('An event is being prepared. The host will start it shortly.')
        .addFields(
          { name: 'Host',         value: host,                          inline: true },
          { name: 'Funder',       value: funder,                        inline: true },
          { name: 'Prize',        value: prize,                         inline: true },
          { name: 'Server Link',  value: serverlink,                    inline: false },
          { name: 'Event ID',     value: `\`${eventId}\``,              inline: true },
        )
        .setTimestamp();

      const eventChannel = await interaction.guild.channels.fetch(EVENT_CHANNEL_ID).catch(() => null);
      if (eventChannel) {
        await eventChannel.send({ embeds: [stagingEmbed], components: [buildEventButtons(eventId)] });
      }

      return interaction.editReply({
        content: `Roblox event \`${eventId}\` has been created. Use the buttons in <#${EVENT_CHANNEL_ID}> to start or cancel.`,
      });
    }

    // ── Custom Event ─────────────────────────────────────────────────────────
    if (sub === 'custom') {
      const name       = interaction.options.getString('name');
      const howitworks = interaction.options.getString('howitworks');
      const host       = interaction.options.getString('host');
      const funder     = interaction.options.getString('funder');
      const prize      = interaction.options.getString('prize');

      await interaction.deferReply({ ephemeral: true });

      const eventId = generateId();

      const event = {
        id:          eventId,
        type:        'custom',
        host_id:     interaction.user.id,
        event_name:  name,
        howitworks,
        host_name:   host,
        funder,
        prize,
        status:      'pending',
        winner_id:   null,
        created_at:  Date.now(),
      };

      const db = loadDB();
      db.events[eventId] = event;
      saveDB(db);

      try {
        await interaction.user.send({
          content: `**Custom Event Created — \`${eventId}\`**\n\nUse \`/endevent id:${eventId}\` when the event is done.`,
        });
      } catch { console.warn('[EVENT] Could not DM host.'); }

      const stagingEmbed = new EmbedBuilder()
        .setTitle(`${name} — Pending`)
        .setColor(0x1a1a2e)
        .setDescription('An event is being prepared. The host will start it shortly.')
        .addFields(
          { name: 'Host',         value: host,            inline: true },
          { name: 'Funder',       value: funder,          inline: true },
          { name: 'Prize',        value: prize,           inline: true },
          { name: 'How It Works', value: howitworks,      inline: false },
          { name: 'Event ID',     value: `\`${eventId}\``, inline: true },
        )
        .setTimestamp();

      const eventChannel = await interaction.guild.channels.fetch(EVENT_CHANNEL_ID).catch(() => null);
      if (eventChannel) {
        await eventChannel.send({ embeds: [stagingEmbed], components: [buildEventButtons(eventId)] });
      }

      return interaction.editReply({
        content: `Custom event \`${eventId}\` has been created. Use the buttons in <#${EVENT_CHANNEL_ID}> to start or cancel.`,
      });
    }
  }

  // ── /endevent ─────────────────────────────────────────────────────────────
  if (commandName === 'endevent') {
    const eventId = interaction.options.getString('id').trim().toUpperCase();
    const db      = loadDB();
    const event   = db.events[eventId];

    if (!event) {
      return interaction.reply({ content: 'Event not found.', ephemeral: true });
    }
    if (event.host_id !== interaction.user.id && !interaction.member.roles.cache.has(HEAD_OF_EVENTS_ROLE_ID)) {
      return interaction.reply({ content: 'Only the event host can end this event.', ephemeral: true });
    }
    if (event.status === 'ended' || event.status === 'cancelled') {
      return interaction.reply({ content: 'This event is already ended or cancelled.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    event.status = 'ended';
    saveDB(db);

    // Unlock general chat
    try {
      const generalChannel = await client.channels.fetch(GENERAL_CHAT_ID);
      if (generalChannel) {
        await generalChannel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          { SendMessages: null },
        );
        await generalChannel.send({
          content: `The event has officially ended. General chat is now unlocked. Thank you for participating!`,
        });
      }
    } catch (err) {
      console.error('[EVENT] Failed to unlock general chat:', err.message);
    }

    // DM winner if there was one
    if (event.winner_id) {
      try {
        const winner = await client.users.fetch(event.winner_id);
        await winner.send({
          content: `Congratulations! You won the event \`${eventId}\`! The number was **${event.secret_number}**. Contact the host to claim your prize: **${event.prize}**.`,
        });
      } catch {
        console.warn('[EVENT] Could not DM winner.');
      }
    }

    // Post end announcement in event channel
    try {
      const eventChannel = await client.channels.fetch(EVENT_CHANNEL_ID);
      if (eventChannel) {
        const endEmbed = new EmbedBuilder()
          .setTitle('Event Ended')
          .setColor(0x8b0000)
          .setDescription(`Event \`${eventId}\` has been officially ended by <@${interaction.user.id}>.`)
          .addFields(
            { name: 'Winner', value: event.winner_id ? `<@${event.winner_id}>` : 'None', inline: true },
            { name: 'Number', value: `${event.secret_number}`, inline: true },
            { name: 'Prize',  value: event.prize, inline: true },
          )
          .setTimestamp();
        await eventChannel.send({ embeds: [endEmbed] });
      }
    } catch (err) {
      console.error('[EVENT] Failed to post end message:', err.message);
    }

    return interaction.editReply({ content: `Event \`${eventId}\` has been ended and general chat has been unlocked.` });
  }

  // ── /warns ────────────────────────────────────────────────────────────────
  if (commandName === 'warns') {
    const target   = interaction.options.getUser('user') ?? interaction.user;
    const db       = loadDB();
    const warnData = db.warns[target.id] ?? { count: 0 };

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Warn Record')
          .setColor(0x1a1a2e)
          .addFields(
            { name: 'User',        value: `<@${target.id}>`,   inline: true },
            { name: 'Total Warns', value: `${warnData.count}`, inline: true },
          )
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  // ── /clearwarns ───────────────────────────────────────────────────────────
  if (commandName === 'clearwarns') {
    const target = interaction.options.getUser('user');
    const db     = loadDB();
    db.warns[target.id] = { count: 0, history: [] };
    saveDB(db);
    return interaction.reply({ content: `All warns for <@${target.id}> have been cleared.`, ephemeral: true });
  }
});

// ─── Message Handler ──────────────────────────────────────────────────────────

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild)     return;

  // ── ,pingleagues prefix command ───────────────────────────────────────────
  if (message.content.trim().toLowerCase() === ',pingleagues') {
    if (!message.member.roles.cache.has(LEAGUE_HOST_ROLE_ID)) {
      const warn = await message.reply({ content: 'You do not have permission to use this command.' });
      setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }
    await message.delete().catch(() => {});
    await message.channel.send({
      content: `<@&${LEAGUES_PING_ROLE_ID}>`,
      allowedMentions: { roles: [LEAGUES_PING_ROLE_ID] },
    });
    return;
  }

  // ── Event guess detection ─────────────────────────────────────────────────
  if (message.channelId === GENERAL_CHAT_ID) {
    const db          = loadDB();
    const activeEvent = Object.values(db.events).find(e => e.status === 'active');

    if (activeEvent) {
      const nums = message.content.trim().split(/\s+/).filter(w => /^\d+$/.test(w));

      // Enforce max 2 numbers per message rule
      if (nums.length > 2) {
        await message.delete().catch(() => {});
        const note = await message.channel.send({
          content: `<@${message.author.id}> You cannot guess more than 2 numbers at once.`,
        });
        setTimeout(() => note.delete().catch(() => {}), 5000);
        return;
      }

      // Check for correct guess
      if (nums.includes(String(activeEvent.secret_number))) {
        activeEvent.status    = 'won';
        activeEvent.winner_id = message.author.id;
        saveDB(db);

        // Lock general chat (@everyone cannot send messages)
        try {
          await message.channel.permissionOverwrites.edit(
            message.guild.roles.everyone,
            { SendMessages: false },
          );
          await message.channel.send({
            content: `A player has guessed the correct number! Chat is now paused. The host will announce the winner shortly.`,
          });
        } catch (err) {
          console.error('[EVENT] Failed to lock general chat:', err.message);
        }

        // DM the host
        try {
          const host = await client.users.fetch(activeEvent.host_id);
          await host.send({
            content:
              `<@${message.author.id}> (**${message.author.username}**) has won the event!\n` +
              `The number **${activeEvent.secret_number}** was guessed!\n\n` +
              `Use \`/endevent id:${activeEvent.id}\` to officially end the event and unlock general chat.`,
          });
        } catch {
          console.warn('[EVENT] Could not DM host the winner.');
        }

        return;
      }
    }
  }

});

// ─── Boot ─────────────────────────────────────────────────────────────────────
if (!TOKEN) {
  console.error('[BOT] DISCORD_TOKEN is not set. Please add it as an environment variable.');
  process.exit(1);
}

client.login(TOKEN).catch(err => {
  console.error('[BOT] Failed to login:', err.message);
  process.exit(1);
});
