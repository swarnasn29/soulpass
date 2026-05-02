use anchor_lang::prelude::*;

declare_id!("6oxNy4uApzwXVKAREsgxSGCSfjpCkRYFCz5aitVTkTyi");

// ----- constants -----
pub const STARTING_REPUTATION: i64 = 500;
pub const REP_CHECK_IN: i64 = 10;
pub const REP_CONNECTION: i64 = 5;
pub const REP_RATING_TO_RATEE: i64 = 2;
pub const REP_NO_SHOW_PENALTY: i64 = -25;
pub const REP_BADGE_BONUS: i64 = 15;

pub const CANCEL_GRACE_SECONDS: i64 = 24 * 60 * 60;
pub const NO_SHOW_GRACE_SECONDS: i64 = 6 * 60 * 60;

pub const MAX_NAME: usize = 48;
pub const MAX_TITLE: usize = 80;
pub const MAX_DESCRIPTION: usize = 480;
pub const MAX_URI: usize = 200;

#[program]
pub mod soulpass {
    use super::*;

    // ---------- identity ----------

    pub fn initialize_user(
        ctx: Context<InitializeUser>,
        name: String,
        metadata_uri: String,
    ) -> Result<()> {
        require!(name.len() <= MAX_NAME, SoulpassError::NameTooLong);
        require!(metadata_uri.len() <= MAX_URI, SoulpassError::UriTooLong);

        let now = Clock::get()?.unix_timestamp;
        let user = &mut ctx.accounts.user_profile;
        user.authority = ctx.accounts.authority.key();
        user.name = name;
        user.metadata_uri = metadata_uri;
        user.reputation = STARTING_REPUTATION;
        user.events_attended = 0;
        user.connections_made = 0;
        user.badges_earned = 0;
        user.no_shows = 0;
        user.created_at = now;
        user.bump = ctx.bumps.user_profile;
        Ok(())
    }

    pub fn update_user_profile(
        ctx: Context<UpdateUserProfile>,
        name: Option<String>,
        metadata_uri: Option<String>,
    ) -> Result<()> {
        let user = &mut ctx.accounts.user_profile;
        if let Some(n) = name {
            require!(n.len() <= MAX_NAME, SoulpassError::NameTooLong);
            user.name = n;
        }
        if let Some(uri) = metadata_uri {
            require!(uri.len() <= MAX_URI, SoulpassError::UriTooLong);
            user.metadata_uri = uri;
        }
        Ok(())
    }

    // ---------- event ----------

    pub fn create_event(
        ctx: Context<CreateEvent>,
        event_id: u64,
        title: String,
        description: String,
        metadata_uri: String,
        start_ts: i64,
        end_ts: i64,
        capacity: u32,
    ) -> Result<()> {
        require!(title.len() <= MAX_TITLE, SoulpassError::NameTooLong);
        require!(description.len() <= MAX_DESCRIPTION, SoulpassError::DescriptionTooLong);
        require!(metadata_uri.len() <= MAX_URI, SoulpassError::UriTooLong);
        require!(end_ts > start_ts, SoulpassError::InvalidEventWindow);
        require!(capacity > 0, SoulpassError::InvalidCapacity);

        let event = &mut ctx.accounts.event;
        event.organizer = ctx.accounts.organizer.key();
        event.event_id = event_id;
        event.title = title;
        event.description = description;
        event.metadata_uri = metadata_uri;
        event.start_ts = start_ts;
        event.end_ts = end_ts;
        event.capacity = capacity;
        event.attendee_count = 0;
        event.checked_in_count = 0;
        event.connection_count = 0;
        event.status = EventStatus::Open;
        event.bump = ctx.bumps.event;
        Ok(())
    }

    pub fn close_event(ctx: Context<CloseEvent>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let event = &mut ctx.accounts.event;
        require!(event.status == EventStatus::Open, SoulpassError::EventNotOpen);
        require!(now >= event.end_ts, SoulpassError::EventStillRunning);
        event.status = EventStatus::Closed;
        Ok(())
    }

    // ---------- registration ----------

    pub fn register_for_event(ctx: Context<RegisterForEvent>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let event = &mut ctx.accounts.event;
        require!(event.status == EventStatus::Open, SoulpassError::EventNotOpen);
        require!(now < event.start_ts, SoulpassError::EventAlreadyStarted);
        require!(
            event.attendee_count < event.capacity,
            SoulpassError::EventFull
        );

        let reg = &mut ctx.accounts.registration;
        reg.attendee = ctx.accounts.attendee.key();
        reg.event = event.key();
        reg.registered_at = now;
        reg.checked_in = false;
        reg.checked_in_at = 0;
        reg.no_show_processed = false;
        reg.bump = ctx.bumps.registration;

        event.attendee_count = event.attendee_count.saturating_add(1);
        Ok(())
    }

    pub fn cancel_registration(ctx: Context<CancelRegistration>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let event = &mut ctx.accounts.event;
        require!(
            now < event.start_ts.saturating_sub(CANCEL_GRACE_SECONDS),
            SoulpassError::CancellationWindowClosed
        );
        let reg = &ctx.accounts.registration;
        require!(!reg.checked_in, SoulpassError::AlreadyCheckedIn);

        event.attendee_count = event.attendee_count.saturating_sub(1);
        // account closed via close = attendee constraint -> rent returned to fee payer
        Ok(())
    }

    // ---------- check-in (PoP) ----------

    pub fn check_in(ctx: Context<CheckIn>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let event = &mut ctx.accounts.event;
        require!(event.status == EventStatus::Open, SoulpassError::EventNotOpen);
        require!(
            now >= event.start_ts.saturating_sub(2 * 60 * 60), // open 2h before start
            SoulpassError::CheckInNotOpen
        );
        require!(now <= event.end_ts, SoulpassError::EventEnded);

        let reg = &mut ctx.accounts.registration;
        require!(!reg.checked_in, SoulpassError::AlreadyCheckedIn);
        require!(
            reg.attendee == ctx.accounts.attendee.key(),
            SoulpassError::WrongAttendee
        );
        require!(reg.event == event.key(), SoulpassError::WrongEvent);

        reg.checked_in = true;
        reg.checked_in_at = now;
        event.checked_in_count = event.checked_in_count.saturating_add(1);

        let user = &mut ctx.accounts.user_profile;
        user.reputation = user.reputation.saturating_add(REP_CHECK_IN);
        user.events_attended = user.events_attended.saturating_add(1);
        Ok(())
    }

    // ---------- networking connection ----------

    pub fn record_connection(ctx: Context<RecordConnection>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let event = &mut ctx.accounts.event;

        let attendance_lo = &ctx.accounts.attendance_lo;
        let attendance_hi = &ctx.accounts.attendance_hi;
        require!(attendance_lo.checked_in, SoulpassError::NotCheckedIn);
        require!(attendance_hi.checked_in, SoulpassError::NotCheckedIn);
        require!(attendance_lo.event == event.key(), SoulpassError::WrongEvent);
        require!(attendance_hi.event == event.key(), SoulpassError::WrongEvent);

        let lo = ctx.accounts.user_lo.key();
        let hi = ctx.accounts.user_hi.key();
        require!(lo != hi, SoulpassError::CannotConnectToSelf);
        require!(lo < hi, SoulpassError::ConnectionPairOutOfOrder);

        // Scanner must be one of the two participants
        let scanner = ctx.accounts.scanner.key();
        require!(scanner == lo || scanner == hi, SoulpassError::ScannerNotParticipant);

        let connection = &mut ctx.accounts.connection;
        connection.event = event.key();
        connection.user_lo = lo;
        connection.user_hi = hi;
        connection.recorded_at = now;
        connection.bump = ctx.bumps.connection;

        event.connection_count = event.connection_count.saturating_add(1);

        let profile_lo = &mut ctx.accounts.profile_lo;
        let profile_hi = &mut ctx.accounts.profile_hi;
        profile_lo.reputation = profile_lo.reputation.saturating_add(REP_CONNECTION);
        profile_hi.reputation = profile_hi.reputation.saturating_add(REP_CONNECTION);
        profile_lo.connections_made = profile_lo.connections_made.saturating_add(1);
        profile_hi.connections_made = profile_hi.connections_made.saturating_add(1);
        Ok(())
    }

    // ---------- peer rating ----------

    pub fn submit_rating(
        ctx: Context<SubmitRating>,
        helpfulness: u8,
        knowledge: u8,
        vibe: u8,
        reliability: u8,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            helpfulness <= 5 && knowledge <= 5 && vibe <= 5 && reliability <= 5,
            SoulpassError::RatingOutOfRange
        );

        let event = &ctx.accounts.event;
        let attendance_rater = &ctx.accounts.attendance_rater;
        let attendance_ratee = &ctx.accounts.attendance_ratee;
        require!(attendance_rater.checked_in, SoulpassError::NotCheckedIn);
        require!(attendance_ratee.checked_in, SoulpassError::NotCheckedIn);
        require!(attendance_rater.event == event.key(), SoulpassError::WrongEvent);
        require!(attendance_ratee.event == event.key(), SoulpassError::WrongEvent);
        require!(
            ctx.accounts.rater.key() != ctx.accounts.ratee.key(),
            SoulpassError::CannotRateSelf
        );

        let rating = &mut ctx.accounts.rating;
        rating.event = event.key();
        rating.rater = ctx.accounts.rater.key();
        rating.ratee = ctx.accounts.ratee.key();
        rating.helpfulness = helpfulness;
        rating.knowledge = knowledge;
        rating.vibe = vibe;
        rating.reliability = reliability;
        rating.submitted_at = now;
        rating.bump = ctx.bumps.rating;

        // Reputation reward proportional to rating average; cap at +REP_RATING_TO_RATEE
        let avg = (helpfulness as i64 + knowledge as i64 + vibe as i64 + reliability as i64) / 4;
        let bump_amount = (REP_RATING_TO_RATEE * avg) / 5;
        let profile_ratee = &mut ctx.accounts.ratee_profile;
        profile_ratee.reputation = profile_ratee.reputation.saturating_add(bump_amount);
        Ok(())
    }

    // ---------- no-show crank ----------

    pub fn mark_no_show(ctx: Context<MarkNoShow>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let event = &ctx.accounts.event;
        require!(
            now >= event.end_ts.saturating_add(NO_SHOW_GRACE_SECONDS),
            SoulpassError::NoShowWindowNotOpen
        );
        let reg = &mut ctx.accounts.registration;
        require!(!reg.checked_in, SoulpassError::AlreadyCheckedIn);
        require!(!reg.no_show_processed, SoulpassError::NoShowAlreadyProcessed);
        reg.no_show_processed = true;

        let user = &mut ctx.accounts.user_profile;
        user.reputation = user.reputation.saturating_add(REP_NO_SHOW_PENALTY);
        user.no_shows = user.no_shows.saturating_add(1);
        Ok(())
    }

    // ---------- badges ----------

    pub fn award_event_badge(ctx: Context<AwardEventBadge>, kind: BadgeKind) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let badge = &mut ctx.accounts.badge;
        badge.owner = ctx.accounts.owner.key();
        badge.kind = kind;
        badge.event = ctx.accounts.event.key();
        badge.earned_at = now;
        badge.bump = ctx.bumps.badge;

        let user = &mut ctx.accounts.user_profile;
        user.badges_earned = user.badges_earned.saturating_add(1);
        user.reputation = user.reputation.saturating_add(REP_BADGE_BONUS);
        Ok(())
    }

    pub fn award_lifetime_badge(ctx: Context<AwardLifetimeBadge>, kind: BadgeKind) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let badge = &mut ctx.accounts.badge;
        badge.owner = ctx.accounts.owner.key();
        badge.kind = kind;
        badge.event = Pubkey::default();
        badge.earned_at = now;
        badge.bump = ctx.bumps.badge;

        let user = &mut ctx.accounts.user_profile;
        user.badges_earned = user.badges_earned.saturating_add(1);
        user.reputation = user.reputation.saturating_add(REP_BADGE_BONUS);
        Ok(())
    }
}

// ============================================================
// Accounts
// ============================================================

#[account]
pub struct UserProfile {
    pub authority: Pubkey,
    pub name: String,
    pub metadata_uri: String,
    pub reputation: i64,
    pub events_attended: u32,
    pub connections_made: u32,
    pub badges_earned: u32,
    pub no_shows: u32,
    pub created_at: i64,
    pub bump: u8,
}

impl UserProfile {
    pub const SIZE: usize = 8
        + 32
        + (4 + MAX_NAME)
        + (4 + MAX_URI)
        + 8
        + 4 + 4 + 4 + 4
        + 8
        + 1;
}

#[account]
pub struct Event {
    pub organizer: Pubkey,
    pub event_id: u64,
    pub title: String,
    pub description: String,
    pub metadata_uri: String,
    pub start_ts: i64,
    pub end_ts: i64,
    pub capacity: u32,
    pub attendee_count: u32,
    pub checked_in_count: u32,
    pub connection_count: u32,
    pub status: EventStatus,
    pub bump: u8,
}

impl Event {
    pub const SIZE: usize = 8
        + 32
        + 8
        + (4 + MAX_TITLE)
        + (4 + MAX_DESCRIPTION)
        + (4 + MAX_URI)
        + 8 + 8
        + 4 + 4 + 4 + 4
        + 1
        + 1;
}

#[account]
pub struct Registration {
    pub attendee: Pubkey,
    pub event: Pubkey,
    pub registered_at: i64,
    pub checked_in: bool,
    pub checked_in_at: i64,
    pub no_show_processed: bool,
    pub bump: u8,
}

impl Registration {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1 + 8 + 1 + 1;
}

#[account]
pub struct Connection {
    pub event: Pubkey,
    pub user_lo: Pubkey,
    pub user_hi: Pubkey,
    pub recorded_at: i64,
    pub bump: u8,
}

impl Connection {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 8 + 1;
}

#[account]
pub struct Rating {
    pub event: Pubkey,
    pub rater: Pubkey,
    pub ratee: Pubkey,
    pub helpfulness: u8,
    pub knowledge: u8,
    pub vibe: u8,
    pub reliability: u8,
    pub submitted_at: i64,
    pub bump: u8,
}

impl Rating {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 1 + 1 + 1 + 1 + 8 + 1;
}

#[account]
pub struct Badge {
    pub owner: Pubkey,
    pub kind: BadgeKind,
    pub event: Pubkey,
    pub earned_at: i64,
    pub bump: u8,
}

impl Badge {
    pub const SIZE: usize = 8 + 32 + 1 + 32 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum EventStatus {
    Draft,
    Open,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum BadgeKind {
    FirstStep,      // first event attended
    Connector,      // hit 50% of attendees
    FullHouse,      // hit 100% of attendees
    Streak3,        // 3 events in a row
    Streak10,       // 10 events
    Networker,      // 25+ lifetime connections
    Reliable,       // 10 attendances zero no-shows
    Organizer,      // organized first event
}

// ============================================================
// Contexts
// ============================================================

#[derive(Accounts)]
#[instruction(name: String, metadata_uri: String)]
pub struct InitializeUser<'info> {
    #[account(
        init,
        payer = fee_payer,
        space = UserProfile::SIZE,
        seeds = [b"user", authority.key().as_ref()],
        bump,
    )]
    pub user_profile: Account<'info, UserProfile>,
    pub authority: Signer<'info>,
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateUserProfile<'info> {
    #[account(
        mut,
        seeds = [b"user", authority.key().as_ref()],
        bump = user_profile.bump,
        has_one = authority,
    )]
    pub user_profile: Account<'info, UserProfile>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(event_id: u64)]
pub struct CreateEvent<'info> {
    #[account(
        init,
        payer = fee_payer,
        space = Event::SIZE,
        seeds = [b"event", organizer.key().as_ref(), &event_id.to_le_bytes()],
        bump,
    )]
    pub event: Account<'info, Event>,
    pub organizer: Signer<'info>,
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseEvent<'info> {
    #[account(
        mut,
        seeds = [b"event", organizer.key().as_ref(), &event.event_id.to_le_bytes()],
        bump = event.bump,
        has_one = organizer,
    )]
    pub event: Account<'info, Event>,
    pub organizer: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterForEvent<'info> {
    #[account(
        init,
        payer = fee_payer,
        space = Registration::SIZE,
        seeds = [b"reg", event.key().as_ref(), attendee.key().as_ref()],
        bump,
    )]
    pub registration: Account<'info, Registration>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    pub attendee: Signer<'info>,
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelRegistration<'info> {
    #[account(
        mut,
        close = fee_payer,
        seeds = [b"reg", event.key().as_ref(), attendee.key().as_ref()],
        bump = registration.bump,
        constraint = registration.attendee == attendee.key() @ SoulpassError::WrongAttendee,
    )]
    pub registration: Account<'info, Registration>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    pub attendee: Signer<'info>,
    #[account(mut)]
    pub fee_payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct CheckIn<'info> {
    #[account(
        mut,
        seeds = [b"reg", event.key().as_ref(), attendee.key().as_ref()],
        bump = registration.bump,
    )]
    pub registration: Account<'info, Registration>,
    #[account(
        mut,
        has_one = organizer,
    )]
    pub event: Account<'info, Event>,
    #[account(
        mut,
        seeds = [b"user", attendee.key().as_ref()],
        bump = user_profile.bump,
    )]
    pub user_profile: Account<'info, UserProfile>,
    /// CHECK: attendee pubkey — verified by PDA seeds and registration.attendee
    pub attendee: AccountInfo<'info>,
    pub organizer: Signer<'info>,
}

#[derive(Accounts)]
pub struct RecordConnection<'info> {
    #[account(
        init,
        payer = fee_payer,
        space = Connection::SIZE,
        seeds = [b"conn", event.key().as_ref(), user_lo.key().as_ref(), user_hi.key().as_ref()],
        bump,
    )]
    pub connection: Account<'info, Connection>,
    #[account(mut)]
    pub event: Account<'info, Event>,

    #[account(
        seeds = [b"reg", event.key().as_ref(), user_lo.key().as_ref()],
        bump = attendance_lo.bump,
    )]
    pub attendance_lo: Account<'info, Registration>,
    #[account(
        seeds = [b"reg", event.key().as_ref(), user_hi.key().as_ref()],
        bump = attendance_hi.bump,
    )]
    pub attendance_hi: Account<'info, Registration>,

    #[account(
        mut,
        seeds = [b"user", user_lo.key().as_ref()],
        bump = profile_lo.bump,
    )]
    pub profile_lo: Account<'info, UserProfile>,
    #[account(
        mut,
        seeds = [b"user", user_hi.key().as_ref()],
        bump = profile_hi.bump,
    )]
    pub profile_hi: Account<'info, UserProfile>,

    /// CHECK: lower-pubkey participant (caller orders before submitting)
    pub user_lo: AccountInfo<'info>,
    /// CHECK: higher-pubkey participant
    pub user_hi: AccountInfo<'info>,
    /// Whoever scanned the QR — must be either user_lo or user_hi (enforced in handler)
    pub scanner: Signer<'info>,

    #[account(mut)]
    pub fee_payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitRating<'info> {
    #[account(
        init,
        payer = fee_payer,
        space = Rating::SIZE,
        seeds = [b"rate", event.key().as_ref(), rater.key().as_ref(), ratee.key().as_ref()],
        bump,
    )]
    pub rating: Account<'info, Rating>,
    pub event: Account<'info, Event>,

    #[account(
        seeds = [b"reg", event.key().as_ref(), rater.key().as_ref()],
        bump = attendance_rater.bump,
    )]
    pub attendance_rater: Account<'info, Registration>,
    #[account(
        seeds = [b"reg", event.key().as_ref(), ratee.key().as_ref()],
        bump = attendance_ratee.bump,
    )]
    pub attendance_ratee: Account<'info, Registration>,

    #[account(
        mut,
        seeds = [b"user", ratee.key().as_ref()],
        bump = ratee_profile.bump,
    )]
    pub ratee_profile: Account<'info, UserProfile>,

    pub rater: Signer<'info>,
    /// CHECK: ratee is identified by pubkey — they don't sign
    pub ratee: AccountInfo<'info>,

    #[account(mut)]
    pub fee_payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MarkNoShow<'info> {
    #[account(
        mut,
        seeds = [b"reg", event.key().as_ref(), attendee.key().as_ref()],
        bump = registration.bump,
    )]
    pub registration: Account<'info, Registration>,
    pub event: Account<'info, Event>,
    #[account(
        mut,
        seeds = [b"user", attendee.key().as_ref()],
        bump = user_profile.bump,
    )]
    pub user_profile: Account<'info, UserProfile>,
    /// CHECK: attendee whose no-show is being marked
    pub attendee: AccountInfo<'info>,
    /// We let the event organizer or fee_payer trigger this
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(kind: BadgeKind)]
pub struct AwardEventBadge<'info> {
    #[account(
        init,
        payer = fee_payer,
        space = Badge::SIZE,
        seeds = [
            b"badge-evt",
            owner.key().as_ref(),
            event.key().as_ref(),
            &[kind as u8],
        ],
        bump,
    )]
    pub badge: Account<'info, Badge>,
    #[account(
        mut,
        seeds = [b"user", owner.key().as_ref()],
        bump = user_profile.bump,
    )]
    pub user_profile: Account<'info, UserProfile>,
    /// CHECK: badge owner pubkey
    pub owner: AccountInfo<'info>,
    pub event: Account<'info, Event>,
    /// Authority that authorizes this badge (organizer or backend signer)
    pub authority: Signer<'info>,
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(kind: BadgeKind)]
pub struct AwardLifetimeBadge<'info> {
    #[account(
        init,
        payer = fee_payer,
        space = Badge::SIZE,
        seeds = [
            b"badge-life",
            owner.key().as_ref(),
            &[kind as u8],
        ],
        bump,
    )]
    pub badge: Account<'info, Badge>,
    #[account(
        mut,
        seeds = [b"user", owner.key().as_ref()],
        bump = user_profile.bump,
    )]
    pub user_profile: Account<'info, UserProfile>,
    /// CHECK: badge owner pubkey
    pub owner: AccountInfo<'info>,
    /// Authority that authorizes this badge (backend signer enforcing thresholds)
    pub authority: Signer<'info>,
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ============================================================
// Errors
// ============================================================

#[error_code]
pub enum SoulpassError {
    #[msg("Name exceeds maximum length.")]
    NameTooLong,
    #[msg("Description exceeds maximum length.")]
    DescriptionTooLong,
    #[msg("URI exceeds maximum length.")]
    UriTooLong,
    #[msg("Event window is invalid (end must be after start).")]
    InvalidEventWindow,
    #[msg("Event capacity must be greater than zero.")]
    InvalidCapacity,
    #[msg("Event is not currently open.")]
    EventNotOpen,
    #[msg("Event is still running.")]
    EventStillRunning,
    #[msg("Event has already started.")]
    EventAlreadyStarted,
    #[msg("Event has ended.")]
    EventEnded,
    #[msg("Event is at full capacity.")]
    EventFull,
    #[msg("Cancellation window has closed.")]
    CancellationWindowClosed,
    #[msg("Already checked in.")]
    AlreadyCheckedIn,
    #[msg("Check-in window is not yet open.")]
    CheckInNotOpen,
    #[msg("Provided attendee does not match registration.")]
    WrongAttendee,
    #[msg("Provided event does not match account.")]
    WrongEvent,
    #[msg("Attendee has not checked in.")]
    NotCheckedIn,
    #[msg("Cannot connect to yourself.")]
    CannotConnectToSelf,
    #[msg("Cannot rate yourself.")]
    CannotRateSelf,
    #[msg("Rating values must be between 0 and 5.")]
    RatingOutOfRange,
    #[msg("No-show grace window not yet elapsed.")]
    NoShowWindowNotOpen,
    #[msg("No-show penalty already applied.")]
    NoShowAlreadyProcessed,
    #[msg("Connection participants must be passed in pubkey-sorted order.")]
    ConnectionPairOutOfOrder,
    #[msg("Scanner must be one of the two participants.")]
    ScannerNotParticipant,
}
