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
} = require('discord.js');

const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const TOKEN          = process.env.DISCORD_TOKEN;
const CLIENT_ID      = process.env.CLIENT_ID;
const GUILD_ID       = process.env.GUILD_ID;

const LEAGUE_CHANNEL_ID    = '1494706706549047356';
const GUIDELINES_CHANNEL_ID = '1494316420228714506';
const LEAGUES_PING_ROLE_ID  = '1494342656845680751';
const LEAGUE_HOST_ROLE_ID   = '1494366881916653690';

// ─── Database ─────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'database.json');

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const init = { leagues: {}, warns: {} };
      fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2));
      return init;
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { leagues: {}, warns: {} };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateLeagueId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getMaxPlayers(format) {
  return { '2v2': 4, '3v3': 6, '4v4': 8 }[format] ?? 4;
}

const FORMAT_LABEL  = { '2v2': '2v2', '3v3': '3v3', '4v4': '4v4' };
const TYPE_LABEL    = { swift: 'Swift Game', war: 'War Game' };
const PERKS_LABEL   = { perks: 'Perks', no_perks: 'No Perks' };
const REGION_LABEL  = {
  europe:        'Europe',
  asia:          'Asia',
  north_america: 'North America',
  south_america: 'South America',
  oceania:       'Oceania',
};

function buildLeagueEmbed(league, guild) {
  const host       = guild.members.cache.get(league.host_id);
  const hostName   = host ? `${host.user.username}` : 'Unknown';
  const maxPlayers = league.max_players;
  const spotsLeft  = maxPlayers - league.players.length;

  return new EmbedBuilder()
    .setTitle('League Available')
    .setColor(0x1a1a2e)
    .addFields(
      { name: 'Format',      value: FORMAT_LABEL[league.format],   inline: true },
      { name: 'Match Type',  value: TYPE_LABEL[league.type],       inline: true },
      { name: 'Perks',       value: PERKS_LABEL[league.perks],     inline: true },
      { name: 'Region',      value: REGION_LABEL[league.region],   inline: true },
      { name: 'Host',        value: hostName,                       inline: true },
      { name: 'Spots Left',  value: `${spotsLeft} / ${maxPlayers}`, inline: true },
      {
        name:   'Players',
        value:  league.players.length > 0
                  ? league.players.map(id => `<@${id}>`).join('  ')
                  : 'None yet',
        inline: false,
      },
      { name: 'League ID',   value: `\`${league.id}\``,            inline: true },
    )
    .setFooter({ text: `Join with: /league join id:${league.id}  |  Cancel with: /league cancel id:${league.id}` })
    .setTimestamp();
}

// ─── Slash Commands ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('league')
    .setDescription('League management')
    .addSubcommand(sub =>
      sub
        .setName('host')
        .setDescription('Host a new league')
        .addStringOption(opt =>
          opt.setName('format')
            .setDescription('Match format')
            .setRequired(true)
            .addChoices(
              { name: '2v2', value: '2v2' },
              { name: '3v3', value: '3v3' },
              { name: '4v4', value: '4v4' },
            ))
        .addStringOption(opt =>
          opt.setName('type')
            .setDescription('Match type')
            .setRequired(true)
            .addChoices(
              { name: 'Swift Game', value: 'swift' },
              { name: 'War Game',   value: 'war'   },
            ))
        .addStringOption(opt =>
          opt.setName('perks')
            .setDescription('Match perks')
            .setRequired(true)
            .addChoices(
              { name: 'Perks',    value: 'perks'    },
              { name: 'No Perks', value: 'no_perks' },
            ))
        .addStringOption(opt =>
          opt.setName('region')
            .setDescription('Region')
            .setRequired(true)
            .addChoices(
              { name: 'Europe',        value: 'europe'        },
              { name: 'Asia',          value: 'asia'          },
              { name: 'North America', value: 'north_america' },
              { name: 'South America', value: 'south_america' },
              { name: 'Oceania',       value: 'oceania'       },
            )))
    .addSubcommand(sub =>
      sub
        .setName('join')
        .setDescription('Join an open league')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('League ID')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub
        .setName('cancel')
        .setDescription('Cancel a league you are hosting')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('League ID to cancel')
            .setRequired(true))),

  new SlashCommandBuilder()
    .setName('guidelines')
    .setDescription('Post server guidelines in the guidelines channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('warns')
    .setDescription('Check warns for a user')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User to check (leave empty for yourself)')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Clear all warns for a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User to clear warns for')
        .setRequired(true)),
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
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands.map(c => c.toJSON()) },
    );
    console.log('[BOT] Slash commands registered.');
  } catch (err) {
    console.error('[BOT] Failed to register commands:', err);
  }
});

// ─── Interactions ─────────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // ── /league ──────────────────────────────────────────────────────────────
  if (commandName === 'league') {
    const sub = interaction.options.getSubcommand();

    // ── host ──────────────────────────────────────────────────────────────
    if (sub === 'host') {
      if (!interaction.member.roles.cache.has(LEAGUE_HOST_ROLE_ID)) {
        return interaction.reply({
          content: 'You do not have the required role to host leagues.',
          ephemeral: true,
        });
      }

      if (interaction.channelId !== LEAGUE_CHANNEL_ID) {
        return interaction.reply({
          content: `Leagues must be hosted in <#${LEAGUE_CHANNEL_ID}>.`,
          ephemeral: true,
        });
      }

      const format = interaction.options.getString('format');
      const type   = interaction.options.getString('type');
      const perks  = interaction.options.getString('perks');
      const region = interaction.options.getString('region');

      const leagueId  = generateLeagueId();
      const maxPlayers = getMaxPlayers(format);

      const league = {
        id:          leagueId,
        host_id:     interaction.user.id,
        format,
        type,
        perks,
        region,
        players:     [interaction.user.id],
        max_players: maxPlayers,
        message_id:  null,
        thread_id:   null,
        status:      'open',
        created_at:  Date.now(),
      };

      const db = loadDB();
      db.leagues[leagueId] = league;
      saveDB(db);

      const embed = buildLeagueEmbed(league, interaction.guild);

      const msg = await interaction.reply({
        content:    `<@&${LEAGUES_PING_ROLE_ID}>`,
        embeds:     [embed],
        fetchReply: true,
      });

      // Create private thread attached to the league message
      let thread = null;
      try {
        thread = await msg.startThread({
          name:                `League ${leagueId} | ${FORMAT_LABEL[format]} ${TYPE_LABEL[type]}`,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
          type:                ChannelType.PrivateThread,
          reason:              `League ${leagueId} thread`,
        });

        await thread.members.add(interaction.user.id);

        const threadEmbed = new EmbedBuilder()
          .setTitle('Private League Thread')
          .setColor(0x1a1a2e)
          .setDescription(
            `This private thread is for league \`${leagueId}\`. Players who join the league will be added here automatically.`
          )
          .addFields(
            {
              name:  'Join Command',
              value: `\`/league join id:${leagueId}\``,
              inline: false,
            },
            {
              name:  'Cancel Command',
              value: `\`/league cancel id:${leagueId}\``,
              inline: false,
            },
          )
          .setTimestamp();

        await thread.send({
          content: `<@${interaction.user.id}>`,
          embeds:  [threadEmbed],
        });
      } catch (err) {
        console.error('[THREAD] Failed to create private thread:', err.message);
      }

      // Persist message and thread IDs
      const dbUpd = loadDB();
      dbUpd.leagues[leagueId].message_id = msg.id;
      dbUpd.leagues[leagueId].thread_id  = thread ? thread.id : null;
      saveDB(dbUpd);

      return;
    }

    // ── join ──────────────────────────────────────────────────────────────
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

      league.players.push(interaction.user.id);

      if (league.players.length >= league.max_players) {
        league.status = 'full';
      }

      saveDB(db);

      // Add member to the private thread
      if (league.thread_id) {
        try {
          const thread = await interaction.guild.channels.fetch(league.thread_id);
          if (thread) {
            await thread.members.add(interaction.user.id);
            await thread.send({ content: `<@${interaction.user.id}> has joined the league.` });

            if (league.status === 'full') {
              await thread.send({
                content: 'The league is now full. All players have been added to this thread. Good luck.',
              });
            }
          }
        } catch (err) {
          console.error('[THREAD] Failed to add member to thread:', err.message);
        }
      }

      // Refresh the embed in the league channel
      try {
        const leagueChannel = await interaction.guild.channels.fetch(LEAGUE_CHANNEL_ID);
        if (leagueChannel && league.message_id) {
          const msg = await leagueChannel.messages.fetch(league.message_id);
          if (msg) {
            await msg.edit({ embeds: [buildLeagueEmbed(league, interaction.guild)] });
          }
        }
      } catch (err) {
        console.error('[EMBED] Failed to update league embed:', err.message);
      }

      return interaction.reply({
        content:   `You have joined league \`${leagueId}\`. You have been added to the private league thread.`,
        ephemeral: true,
      });
    }

    // ── cancel ────────────────────────────────────────────────────────────
    if (sub === 'cancel') {
      const leagueId = interaction.options.getString('id').trim().toUpperCase();
      const db       = loadDB();
      const league   = db.leagues[leagueId];

      if (!league) {
        return interaction.reply({ content: 'League not found.', ephemeral: true });
      }

      const isHost     = league.host_id === interaction.user.id;
      const hasPermission = interaction.member.roles.cache.has(LEAGUE_HOST_ROLE_ID);

      if (!isHost && !hasPermission) {
        return interaction.reply({
          content:   'You can only cancel a league you are hosting.',
          ephemeral: true,
        });
      }

      if (league.status === 'cancelled') {
        return interaction.reply({ content: 'This league is already cancelled.', ephemeral: true });
      }

      league.status = 'cancelled';
      saveDB(db);

      // Update the embed
      try {
        const leagueChannel = await interaction.guild.channels.fetch(LEAGUE_CHANNEL_ID);
        if (leagueChannel && league.message_id) {
          const msg = await leagueChannel.messages.fetch(league.message_id);
          if (msg) {
            const cancelEmbed = new EmbedBuilder()
              .setTitle('League Cancelled')
              .setColor(0x8b0000)
              .setDescription(
                `League \`${leagueId}\` has been cancelled by <@${interaction.user.id}>.`
              )
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

      // Archive thread
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

      return interaction.reply({
        content:   `League \`${leagueId}\` has been cancelled.`,
        ephemeral: true,
      });
    }
  }

  // ── /guidelines ───────────────────────────────────────────────────────────
  if (commandName === 'guidelines') {
    await interaction.deferReply({ ephemeral: true });

    const channel = await interaction.guild.channels.fetch(GUIDELINES_CHANNEL_ID).catch(() => null);
    if (!channel) {
      return interaction.editReply({ content: 'Guidelines channel not found.' });
    }

    const guidelineEmbeds = [
      new EmbedBuilder()
        .setTitle('Section I: The FCD Code of Conduct')
        .setColor(0x1a1a2e)
        .setDescription(
          'Our goal is to build the best MVSD community on Discord. This requires everyone to act with common sense and basic decency. Any behavior that ruins the fun for others — whether through saltiness, ego, or genuine malice — has no place here. We expect you to keep the vibes high and the competition clean.\n\n' +
          '**External Links:**\nhttps://discord.com/terms\nhttps://discord.com/guidelines'
        ),

      new EmbedBuilder()
        .setTitle('Section II: Respect & Interaction')
        .setColor(0x1a1a2e)
        .setDescription(
          '» **Keep it Civil:** We do not care how good you are at the game; if you are toxic, you are out. This includes any form of racism, slurs, or bullying. Trash talk is part of the game, but keep it focused on the match — never make it personal or identity-based.'
        ),

      new EmbedBuilder()
        .setTitle('Section III: Privacy & Safety First')
        .setColor(0x1a1a2e)
        .setDescription(
          '» **No Leaks:** Your online life stays online. Attempting to find or share anyone\'s real-world name, location, or private photos (doxing) is the fastest way to get banned. We have zero patience for anyone who threatens the safety of our members.'
        ),

      new EmbedBuilder()
        .setTitle('Section IV: Server Cleanliness')
        .setColor(0x1a1a2e)
        .setDescription(
          '» **Keep it SFW:** We are a gaming community, not a place for adult content. Posting NSFW images, links, or having overly graphic conversations is strictly prohibited. If you would not show it to a younger sibling, do not post it here.'
        ),

      new EmbedBuilder()
        .setTitle('Section V: Promotion & Scams')
        .setColor(0x1a1a2e)
        .setDescription(
          '» **No Unauthorized Ads:** Do not join just to DM our members your own server links or cheap gem scams. We consider this predatory. If you want to partner with FCD, go through the proper staff channels. Spamming, whether in channels or DMs, will be handled by our auto-mod immediately.'
        ),

      new EmbedBuilder()
        .setTitle('Section VI: Leadership & Disputes')
        .setColor(0x1a1a2e)
        .setDescription(
          '» **Staff Decisions:** Our moderators are here to keep the server running. Their word is final in any dispute. If you disagree with a warn or a mute, take it to a private ticket — do not start a scene in the general chat. Disrupting the server to argue with staff will result in a kick.'
        ),

      new EmbedBuilder()
        .setTitle('Section VII: Your Account, Your Risk')
        .setColor(0x1a1a2e)
        .setDescription(
          '» **No Excuses:** You are the only person who should have access to your account. If your friend gets you banned while on your computer, the ban stays. Additionally, using alts to dodge a punishment is a permanent, non-appealable offense for your main account and your IP.'
        ),
    ];

    // Clear existing messages then post fresh guidelines
    try {
      const fetched = await channel.messages.fetch({ limit: 100 });
      await channel.bulkDelete(fetched);
    } catch {
      // Channel may not support bulk delete or messages are too old — proceed anyway
    }

    for (const embed of guidelineEmbeds) {
      await channel.send({ embeds: [embed] });
    }

    return interaction.editReply({ content: 'Guidelines have been posted.' });
  }

  // ── /warns ────────────────────────────────────────────────────────────────
  if (commandName === 'warns') {
    const target   = interaction.options.getUser('user') ?? interaction.user;
    const db       = loadDB();
    const warnData = db.warns[target.id] ?? { count: 0 };

    const embed = new EmbedBuilder()
      .setTitle('Warn Record')
      .setColor(0x1a1a2e)
      .addFields(
        { name: 'User',         value: `<@${target.id}>`,        inline: true },
        { name: 'Total Warns',  value: `${warnData.count}`,       inline: true },
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── /clearwarns ───────────────────────────────────────────────────────────
  if (commandName === 'clearwarns') {
    const target = interaction.options.getUser('user');
    const db     = loadDB();
    db.warns[target.id] = { count: 0, history: [] };
    saveDB(db);
    return interaction.reply({
      content:   `All warns for <@${target.id}> have been cleared.`,
      ephemeral: true,
    });
  }
});

// ─── Automod ──────────────────────────────────────────────────────────────────
const BAD_WORDS = [
  'fuck', 'fck', 'f u c k',
  'bitch', 'btch', 'b1tch',
  'shit', 'sh1t',
  'cunt',
  'nigga', 'nigger', 'n1gga', 'n1gger',
  'whore',
  'slut',
  'bastard',
  'cock',
  'dick',
  'pussy',
  'motherfucker', 'mf',
  'asshole',
];

// Warn milestones → timeout duration in ms
const WARN_MILESTONES = {
  1:  30 * 60 * 1000,           // 30 minutes
  5:  15 * 60 * 1000,           // 15 minutes
  10: 60 * 60 * 1000,           // 1 hour
  15: 5 * 60 * 60 * 1000,       // 5 hours
  30: 2 * 24 * 60 * 60 * 1000,  // 2 days
};

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild)     return;

  const normalized = message.content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const triggered = BAD_WORDS.some(word => {
    const clean = word.replace(/\s+/g, '');
    return normalized.includes(clean) || normalized.split(' ').includes(clean);
  });

  if (!triggered) return;

  // Delete the offending message
  await message.delete().catch(() => {});

  // Update warn record
  const db = loadDB();
  if (!db.warns[message.author.id]) {
    db.warns[message.author.id] = { count: 0, history: [] };
  }

  db.warns[message.author.id].count += 1;
  db.warns[message.author.id].history.push({
    reason:    'Automod: Inappropriate language',
    timestamp: Date.now(),
  });

  const warnCount = db.warns[message.author.id].count;

  // Reset after 30 warns (record the 30-warn timeout first, then reset)
  const shouldReset = warnCount >= 30;

  saveDB(db);

  // Apply timeout if this is a milestone
  const timeoutMs = WARN_MILESTONES[warnCount] ?? null;
  if (timeoutMs && message.member) {
    await message.member.timeout(
      timeoutMs,
      `Automod warn #${warnCount}: Inappropriate language`,
    ).catch(() => {});
  }

  // Post brief notification, delete after 6 seconds
  try {
    const note = await message.channel.send({
      content: `<@${message.author.id}> Your message was removed for inappropriate language. Warn **#${warnCount}**.`,
    });
    setTimeout(() => note.delete().catch(() => {}), 6000);
  } catch { /* channel may be unavailable */ }

  // Reset warns after the 30-warn milestone
  if (shouldReset) {
    const dbAfter = loadDB();
    dbAfter.warns[message.author.id] = { count: 0, history: [] };
    saveDB(dbAfter);
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
