import { BArray, Bytes, Enum, FixedLengthString, Int16ub, Int16ul, Int32ub, Int32ul, Int8u, Struct, type BinType } from "../util/bin"
import { decodePokeString, encodePokeString } from "./poke-encoding"
import { items } from "./types/items"
import { moves } from "./types/moves"
import { species } from "./types/species"

// A Pokéwalker-encoded variable-length string. The read returns BOTH the
// decoded text and the original raw bytes — writing back uses the raw bytes
// directly so factory-padded fields (whose post-terminator bytes can be
// either 0xFF or 0x00 depending on history) round-trip byte-exact.
//
// When the user edits the text, the editor UI re-encodes by:
//   1. Writing the new text + 0xFFFF terminator
//   2. Preserving the original trailing bytes from `_raw`
// (See editPokeString in src/state/eeprom for the helper.)
export type PokeStringValue = {
    _data: string;
    _raw: Uint8Array;
    _type: 'pokestring';
}

const PokeString = (length: number): BinType<PokeStringValue> => {
    const byteLen = length * 2
    return {
        read: (data, offset) => ({
            _data: decodePokeString(data, offset, length),
            _raw: new Uint8Array(data.buffer.slice(offset, offset + byteLen)),
            _type: 'pokestring',
        }),
        // Write the raw bytes directly. The text field is for display/edit
        // only; mutations replace the entire `_raw` via the state helper.
        write: (data, offset, value) => {
            const dst = new Uint8Array(data.buffer, offset, byteLen)
            dst.set(value._raw)
        },
        length: byteLen,
    }
}

type SpriteValue = {
    data: Uint8Array;
    _width: number;
    _height: number;
    _type: 'sprite';
}

export const Sprite = (width: number, height: number): BinType<SpriteValue> => {
    const bytes = Bytes(width * height / 4)
    return {
        read: (data, offset) => ({
            data: bytes.read(data, offset),
            _width: width,
            _height: height,
            _type: 'sprite',
        }),
        write: (data, offset, value) => bytes.write(data, offset, value.data),
        length: bytes.length,
    }
}

const PokemonSpecies = Enum(Int16ul, species)

const Move = Enum(Int16ul, moves)

const Item = Enum(Int16ul, items)

const UniqueIdentitySpec = Bytes(0x28)

const IdentitySpec = Struct({
    'unk0': Int32ub,
    'unk1': Int32ub,
    'unk2': Int16ub,
    'unk3': Int16ub,
    'trainerTID': Int16ub,
    'trainerSID': Int16ub,
    'uniq': UniqueIdentitySpec,
    'evtBmp': Bytes(0x10),
    'trainerName': PokeString(8),
    'unk4': Int8u,
    'unk5': Int8u,
    'unk6': Int8u,
    'flags': Int8u,
    'protoVer': Int8u,
    'unk7': Int8u,
    'protoSubver': Int8u,
    'unk8': Int8u,
    'lastSyncTime': Int32ub,
    'stepCount': Int32ub,
})

const PeerPlaySpec = Struct({
    'curStepCount': Int32ul,
    'curWatts': Int16ul,
    'pad1': Bytes(2),
    'unk0': Int32ul,
    'unk2': Int16ul,
    'species': PokemonSpecies,
    'pokeNickName': PokeString(11),
    'trainerName': PokeString(8),
    'pokeGenderForm': Int8u,
    'pokeIsSpecial': Int8u,
})

const LcdConfigSpec = Struct({
    'contrastAndFlags': Bytes(1),
    'commands': Bytes(0x3f)
})

const EnrollDataSpec = Struct({
    'uniq': UniqueIdentitySpec,
    'lcdCmds': LcdConfigSpec,
    'magix': Bytes(8),
})

// Persisted session-save block (24 bytes). Mirrors the in-RAM
// session_save_block byte-for-byte; written via the reliable-save
// path (primary + backup + checksum).
const save_block = Struct({
    'lifetimeSteps': Int32ub,        // cumulative steps, never reset
    'walkSessionSteps': Int32ub,     // steps in current walk session; zeroed at walk start
    'rtcTime': Int32ub,              // persisted RTC value; slaved from peer during IR sync
    'dayCounter': Int16ub,           // increments at midnight; drives daily-reset logic
    'curWatts': Int16ub,             // current watts balance (currency for items/battle)
    'sessionTicksElapsed': Int16ub,  // ticks within current session (~minute-scale)
    'stepWattCounter': Int8u,        // fractional-watt accumulator (1 watt per N steps)
    'peerSlotIndex': Int8u,          // rotating index into the peer-log EEPROM ring
    'peerSlotIndexTail': Bytes(3),   // reserved as part of a u32 with peerSlotIndex; tail unused
    'settings': Int8u,               // packed: bit0=mute, bit1-3=volume, bit4-7=contrast (TBD)
})

const copy_marker = Bytes(1)

const pokemon_summary = Struct({
    'species': PokemonSpecies,
    'heldItem': Item,
    'moves': BArray(4, Move),
    'level': Int8u,
    'variantAndFlags': Int8u,
    'moreFlags': Bytes(1),
    'padding': Bytes(1),
})

const event_poke_extra_data = Struct({
    'unk0': Int32ul,
    'otTid': Int16ul,
    'otSid': Int16ul,
    'unk1': Int16ul,
    'locationMet': Int16ul,
    'unk2': Int16ul,
    'otName': PokeString(8),
    'encounterType': Int8u,
    'ability': Int8u,
    'pokeballType': Int16ul,
    'unk3': Bytes(10),
})

export const PokeSpec = Struct({
    'species': PokemonSpecies,
    'heldItem': Item,
    'moves': BArray(4, Move),
    'otTID': Int16ul,
    'otSID': Int16ul,
    'pid': Int32ul,
    'ivs': Int32ul,
    'evs': BArray(6, Int8u),
    'variant': Int8u,
    'sourceGame': Int8u,
    'ability': Int8u,
    'happiness': Int8u,
    'level': Int8u,
    'padding': Bytes(1),
    'nickname': PokeString(10)
})

const team_data = Struct({
    'unk0': Bytes(8),
    'uniq': UniqueIdentitySpec,
    'tid': Int16ul,
    'sid': Int16ul,
    'unk1': Bytes(4),
    'name': PokeString(8),
    'unk2': BArray(3, 
        Struct({
            'flags': Int32ul,
            'val': Int16ul,
            'always_ffff': Bytes(2)
        })
    ),
    'pokes': BArray(6, PokeSpec),
    'unknownZero': Bytes(0x74),
})

const event_log_item = Struct({
    'eventTime': Int32ub,
    'unk0': Int32ub,
    'unk2': Int16ub,
    'walkingPokeSpecies': PokemonSpecies,
    'caughtSpecies': PokemonSpecies,
    'extraData': Int16ul,
    'remoteTrnrName': PokeString(8),
    'pokeNick': PokeString(11),
    'remPokeNick': PokeString(11),
    'routeImageIdx': Bytes(1),
    'pokeFriendship': Int8u,
    'watts': Int16ub,
    'remoteWatts': Int16ub,
    'stepCount': Int32ub,
    'remoteStepCount': Int32ub,
    'eventType': Int16ul,
    'genderAndForm': Int8u,
    'caughtGenderAndForm': Int8u,
    'padding': Bytes(42)
})

const route_info = Struct({
    'poke': pokemon_summary,
    'nickname': PokeString(11),
    'friendship': Int8u,
    'routeImageIdx': Int8u,
    'routeName': PokeString(21),
    'routePokes': BArray(3, pokemon_summary),
    'routePokeMinSteps': BArray(3, Int16ul),
    'routePokeChance': BArray(3, Int8u),
    'pad1': Bytes(1),
    'routeItems': BArray(10, Item),
    'routeItemMinSteps': BArray(10, Int16ul),
    'routeItemChance': BArray(10, Int8u),
})

const special_route = Struct({
    'itemInfoUnused': BArray(6, Int8u),
    'routeImageIdx': Int8u,
    'padding1': Bytes(1),
    'specialPoke': pokemon_summary,
    'specialPokeExtra': event_poke_extra_data,
    'minStepsForSpecialPoke': Int16ul,
    'percentChanceSpecialPoke': Int8u,
    'padding2': Bytes(1),
    'specialItem': Item,
    'minStepsForSpecialItem': Int16ul,
    'percentChanceSpecialItem': Int8u,
    'padding3': Bytes(3),
    'specialRouteName': PokeString(21),
    'pokeEvtNum': Int8u,
    'itemEvtNum': Int8u,
    'pokeAnimatedSmallImg': BArray(10, Sprite(32, 24)),
    'pokeNameImage': Bytes(0x140),
    'areaSmallImage': Bytes(0xc0),
    'areaTextNameImg': Bytes(0x140),
    'itemNameImg': Bytes(0x180),
})

// Directory entry for one UI sound effect. Indexed by the SND_* enum
// used by the walker firmware (e.g. SND_CONFIRM, SND_FANFARE,
// SND_BATTLE_START). `offset` is into the sound data pool that
// immediately follows the directory. The walker validates `checksum`
// (sum of the referenced sample bytes) before playing. Sample length
// is capped at 0xC0 bytes; any longer entry is silently dropped.
//
// (Dmitry's article called this region "random checksum descriptor
// addrs" — that interpretation was incorrect; it's the sound engine.)
const sound_sample_entry = Struct({
    'offset': Int16ul,   // LE; offset into soundDataPool
    'length': Int8u,     // sample length in bytes (≤0xC0)
    'checksum': Int8u,   // sum of all sample bytes
})

const item_data = Struct({ 'item': Item, 'unused': Int16ul })

const important_data = Struct({
    'adcCalibration': Bytes(2),
    'adcReliable': Bytes(1),
    'uniq': UniqueIdentitySpec,
    'uniqReliable': Bytes(1),
    'lcdConfig': LcdConfigSpec,
    'lcdReliable': Bytes(1),
    'identity': IdentitySpec,
    'identityReliable': Bytes(1),
    'saveBlock': save_block,
    'saveBlockReliable': Bytes(1),
    'copy': copy_marker,
    'copyReliable': Bytes(1),
    'padding': Bytes(0xF),
})

export const SpritesSpec = Struct({
    digit_0: Sprite(8, 16),
    digit_1: Sprite(8, 16),
    digit_2: Sprite(8, 16),
    digit_3: Sprite(8, 16),
    digit_4: Sprite(8, 16),
    digit_5: Sprite(8, 16),
    digit_6: Sprite(8, 16),
    digit_7: Sprite(8, 16),
    digit_8: Sprite(8, 16),
    digit_9: Sprite(8, 16),
    digit_colon: Sprite(8, 16),
    digit_dash: Sprite(8, 16),
    digit_slash: Sprite(8, 16),
    watt: Sprite(16, 16),
    pokeball: Sprite(8, 8),
    event_pokeball: Sprite(8, 8),
    unused1: Sprite(8, 4),
    item: Sprite(8, 8),
    event_item: Sprite(8, 8),
    map: Sprite(8, 8),
    heart: Sprite(8, 8),
    spade: Sprite(8, 8),
    diamond: Sprite(8, 8),
    club: Sprite(8, 8),
    up: Sprite(8, 8),
    up_offset: Sprite(8, 8),
    up_inverted: Sprite(8, 8),
    down: Sprite(8, 8),
    down_offset: Sprite(8, 8),
    down_inverted: Sprite(8, 8),
    left: Sprite(8, 8),
    left_offset: Sprite(8, 8),
    left_inverted: Sprite(8, 8),
    right: Sprite(8, 8),
    right_offset: Sprite(8, 8),
    right_inverted: Sprite(8, 8),
    menu_left: Sprite(8, 16),
    menu_right: Sprite(8, 16),
    menu_return: Sprite(8, 16),
    unused2: Sprite(8, 16),
    more_messages_or: Sprite(8, 8),
    more_messages_and: Sprite(8, 4),
    vial: Sprite(8, 8),
    low_battery: Sprite(8, 8),
    emote_exclamation: Sprite(24, 16),
    emote_heart: Sprite(24, 16),
    emote_note: Sprite(24, 16),
    emote_smile: Sprite(24, 16),
    emote_neutral: Sprite(24, 16),
    emote_ellipsis: Sprite(24, 16),
    bubble_exclamation: Sprite(24, 16),
    menu_pokeradar_txt: Sprite(80, 16),
    menu_dowsing_txt: Sprite(80, 16),
    menu_connect_txt: Sprite(80, 16),
    menu_trainercard_txt: Sprite(80, 16),
    menu_poke_and_items_txt: Sprite(80, 16),
    menu_settings_txt: Sprite(80, 16),
    menu_pokeradar: Sprite(16, 16),
    menu_dowsing: Sprite(16, 16),
    menu_connect: Sprite(16, 16),
    menu_trainercard: Sprite(16, 16),
    menu_poke_and_items: Sprite(16, 16),
    menu_settings: Sprite(16, 16),
    trainer: Sprite(16, 16),
    curr_trainer_name: Sprite(80, 16),
    route_icon: Sprite(16, 16),
    steps_txt: Sprite(40, 16),
    time_txt: Sprite(32, 16),
    days_txt: Sprite(40, 16),
    total_days_txt: Sprite(64, 16),
    sound_txt: Sprite(40, 16),
    shade_txt: Sprite(40, 16),
    sound_off: Sprite(24, 16),
    sound_low: Sprite(24, 16),
    sound_high: Sprite(24, 16),
    contrast_bar: Sprite(8, 16),
    chest_large: Sprite(32, 24),
    map_large: Sprite(32, 24),
    large_present: Sprite(32, 24),
    dowsing_bush_dark: Sprite(16, 16),
    dowsing_bush_light: Sprite(16, 16),
    left_txt: Sprite(32, 16),
    blank: Sprite(16, 24),
    bush_dark: Sprite(32, 24),
    exclamation_bubble1: Sprite(16, 16),
    exclamation_bubble2: Sprite(16, 16),
    exclamation_bubble3: Sprite(16, 16),
    bush_poke_found: Sprite(16, 16),
    attack: Sprite(16, 32),
    crit: Sprite(16, 32),
    cloud: Sprite(32, 24),
    hp_bar: Sprite(8, 8),
    catch: Sprite(8, 8),
    battle_menu: Sprite(96, 32),
    pokewalker: Sprite(32, 32),
    ir: Sprite(8, 16),
    music: Sprite(8, 8),
    blank_icon: Sprite(8, 8),
    hours_txt: Sprite(40, 16),
    connecting_txt: Sprite(96, 16),
    no_trainer_txt: Sprite(96, 16),
    cannot_comp_conn_txt: Sprite(96, 32),
    cannot_connect_txt: Sprite(96, 16),
    trainer_unavail_txt: Sprite(96, 32),
    already_recv_event_txt: Sprite(96, 32),
    cannot_conn_again_txt: Sprite(96, 32),
    could_not_recv_txt: Sprite(96, 32),
    has_arrived_txt: Sprite(96, 16),
    has_left_txt: Sprite(96, 16),
    received_txt: Sprite(96, 16),
    completed_txt: Sprite(96, 16),
    special_map_txt: Sprite(96, 16),
    stamp_txt: Sprite(96, 16),
    special_route_txt: Sprite(96, 16),
    need_more_watts_txt: Sprite(96, 16),
    no_poke_held_txt: Sprite(96, 16),
    nothing_held_txt: Sprite(96, 16),
    discover_item_txt: Sprite(96, 16),
    found_txt: Sprite(96, 16),
    nothing_found_txt: Sprite(96, 16),
    its_near_txt: Sprite(96, 16),
    its_far_txt: Sprite(96, 16),
    find_poke_txt: Sprite(96, 16),
    found_something_txt: Sprite(96, 16),
    it_got_away_txt: Sprite(96, 16),
    appeared_txt: Sprite(96, 16),
    was_caught_txt: Sprite(96, 16),
    fled_txt: Sprite(96, 16),
    was_too_strong_txt: Sprite(96, 16),
    attacked_txt: Sprite(96, 16),
    evaded_txt: Sprite(96, 16),
    crit_txt: Sprite(96, 16),
    blank_txt: Sprite(96, 16),
    threw_pokeball_txt: Sprite(96, 16),
    almost_had_it_txt: Sprite(96, 16),
    stare_down_txt: Sprite(96, 16),
    lost_txt: Sprite(96, 16),
    has_arrived_txt2: Sprite(96, 16),
    had_adventures_txt: Sprite(96, 16),
    play_battled_txt: Sprite(96, 16),
    went_for_run_txt: Sprite(96, 16),
    went_for_walk_txt: Sprite(96, 16),
    played_a_bit_txt: Sprite(96, 16),
    heres_a_gift_txt: Sprite(96, 16),
    cheered_txt: Sprite(96, 16),
    is_very_happy_txt: Sprite(96, 16),
    is_having_fun_txt: Sprite(96, 16),
    is_feeling_good_txt: Sprite(96, 16),
    is_happy_txt: Sprite(96, 16),
    is_smiling_txt: Sprite(96, 16),
    is_cheerful_txt: Sprite(96, 16),
    is_patient_txt: Sprite(96, 16),
    sits_quietly_txt: Sprite(96, 16),
    turned_to_look_txt: Sprite(96, 16),
    is_looking_around_txt: Sprite(96, 16),
    is_looking_this_way_txt: Sprite(96, 16),
    is_daydreaming_txt: Sprite(96, 16),
    found_something_txt2: Sprite(96, 16),
    what_txt: Sprite(96, 16),
    joined_you_txt: Sprite(96, 16),
    reward_txt: Sprite(96, 16),
    good_job_txt: Sprite(96, 16),
    switch_txt: Sprite(80, 16),
    orphanSprite: Sprite(32, 8),  // 0x8C70..0x8CAF: not referenced by firmware. Looks
                                  // like an unused/orphan sprite slot. Identical across
                                  // US/EU walkers; different content on JP — region-
                                  // specific factory-baked asset that never gets blitted.
})

// Top-level format groups fields into semantic regions of the EEPROM.
// Each group is a Struct/BArray covering a contiguous byte range. The
// editor UI renders these as collapsible folders, so opening a group
// brings up just its sub-fields.
//
// Padding / unused / gap regions throughout the EEPROM use the naming
// scheme `_pad_0x<addr>` where `<addr>` is the start address in hex.
// These regions are either all-0xFF (never written), all-zero, or
// otherwise inert in production dumps. Single underscore prefix marks
// them as "not real data" to make scrolling past them obvious.

// 0x0000..0x007F (128 B): magic + factory signature + watchdog counter.
const header = Struct({
    'nintendo': FixedLengthString(8),
    'productSignature': Bytes(8), // 0x0008..0x000F: fixed 8-byte Nintendo signature
                                   // (same on every walker checked — US/EU/JP all show
                                   // `02 01 00 96 05 dc 00 8c`). Not a per-unit serial.
                                   // Written by IR_CMD_FACTORY_TEST + IR_CMD_DEBUG_MODE,
                                   // never read by walker firmware. Likely a Nintendo
                                   // product/hardware-revision code.
    '_pad_0x0010': Bytes(98),    // all 0xFF in every production dump checked
    'numResets': Int8u,
    '_pad_0x0073': Bytes(13),    // all 0xFF in production dumps
})

// 0x0080..0x027F (512 B): reliable save data — primary copy at 0x0080
// + identical-format backup at 0x0180. Each `important_data` block
// holds ADC calibration, the unique-identity block, LCD init sequence,
// trainer identity, health/save block, and the copy marker, each with
// a one-byte "reliable" checksum trailer.
const reliableSaves = Struct({
    'important1': important_data,
    'important2': important_data,
})

// 0x8CB0..0x8EFF (592 B): UI sound effect engine — 16-entry sound
// directory and the note-sequence data pool.
const soundEngine = Struct({
    'soundDirectory': BArray(16, sound_sample_entry),  // 64 B; 16× UI sound-effect entries
                                  //   (SND_CONFIRM, SND_FANFARE, SND_BATTLE_START, etc.)
    'soundDataPool': Bytes(528),  // packed note-sequence data referenced by soundDirectory
})

// 0x8F00..0xB7FF: the current-route asset bundle — RouteInfo struct
// followed by all the rendered sprites the walker needs to display
// the walking pokémon, the route's available pokémon, and the route's
// item names. Refreshed whenever the walker starts a new route. The
// trailing 66 zero bytes are padding before the specials bitfield.
const currentRoute = Struct({
    'routeInfo': route_info,
    'areaSprite': Sprite(32, 24),
    'areaNameSprite': Sprite(80, 16),
    'walkPokeAnimatedSpritesSmall': BArray(2, Sprite(32, 24)),
    'walkPokeAnimatedSpriteLarge': BArray(2, Sprite(64, 48)),
    'walkPokeNameSprite': Sprite(80, 16),
    'routePokeSprites': BArray(3, BArray(2, Sprite(32, 24))),
    'joinPokeAnimatedSprite': BArray(2, Sprite(64, 48)),
    'routePokeNameSprites': BArray(3, Sprite(80, 16)),
    'itemNameSprites': BArray(10, Sprite(96, 16)),
    '_pad_0xB7BE': Bytes(66),    // zero padding before specials bitfield
})

// 0xB800..0xBEFF: received-specials region — bitfield byte at 0xB800
// flagging which event/special items have been received, plus the
// raw "special map" data block and the event-stuff (event poke +
// event item images).
const receivedSpecials = Struct({
    'receivedSet': Bytes(1),     // 0xB800: specials bitfield (stamps, special map,
                                 // event poke held, event item held, special route)
    '_pad_0xB801': Bytes(3),
    'specialMap': Bytes(576),    // 0xB804..0xBA43: "special map data" per dmitry.
                                 // All zero on every production dump we checked —
                                 // feature exists in firmware but appears to have
                                 // never been used by any DS-side distribution.
    'eventstuff': Bytes(1156),
    '_pad_0xBEC8': Bytes(56),
})

// 0xCC00..0xCE7F: our team for trainer-house battles + trailing pads.
const ourTeam = Struct({
    'team': team_data,
    '_pad_0xCE24': Bytes(0x5C),
    '_pad_0xCE80': Bytes(8),
})

// 0xCE88..0xCF0B (132 B): per-session bookkeeping — STARF flag,
// current-watts mirror, caught pokémon, dowsed items, gifted items,
// daily step history.
const bookkeeping = Struct({
    'giveStarf': Int8u,
    '_pad_0xCE89': Bytes(1),
    'wattsForRemote': Int16ub,
    'caughtPokes': BArray(3, pokemon_summary),
    'dowsedItems': BArray(3, item_data),
    'giftedItems': BArray(10, item_data),
    'stepsHistory': BArray(7, Int32ub),
})

// 0xDC00..0xF38B: peer-play state — current peer's team_data at
// 0xDC00, and a 10-entry "peers we've met" ring at 0xDE24.
const peerData = Struct({
    'peer': team_data,
    'metPeers': BArray(10, team_data),
})

export const format = Struct({
    'header': header,
    'reliableSaves': reliableSaves,
    'sprites': SpritesSpec,
    'soundEngine': soundEngine,
    'currentRoute': currentRoute,
    'receivedSpecials': receivedSpecials,
    'specialRoute': special_route,
    '_pad_0xCBBC': Bytes(68),    // between specialRoute and ourTeam
    'ourTeam': ourTeam,
    'bookkeeping': bookkeeping,
    'eventLog': BArray(24, event_log_item),
    '_pad_0xDBCC': Bytes(0x34),  // between eventLog and peerData
    'peerData': peerData,
    // 0xF38C..0xFFFF (3188 B / 0xC74): tail of the scenario backup
    // region. Conceptually mirrors source 0xAB8C..0xB7FF (the second
    // half of route item-name sprites + their trailing zero padding),
    // copied here at walk start. Across all five dumps in public/
    // (US/EU/JP/wiped) this region contains a byte-for-byte duplicate
    // of route items 2..9 starting at offset +0x32 (= 0xF3BE absolute),
    // followed by 66 bytes of zero padding mirroring 0xB7BE..0xB7FF.
    //
    // The first ~0x300 bytes (0xF400..0xF6F7) get OVERWRITTEN with
    // peer-play poke sprite + name + PeerPlayData during a sync
    // session (verified — pw_firm reads these addresses in gfx.c and
    // ir_protocol.c). After the sync, walk-start reprovisioning
    // restores the mirror.
    //
    // Defined as raw bytes here; use the sprite-explorer tool at
    // /sprite-explorer.html to inspect the embedded item-name sprites
    // (96x16 each, starting at 0xF3BE with 8 entries).
    'routeAssetsBackupTail': Bytes(0xC74),
})