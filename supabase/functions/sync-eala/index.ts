import postgres from "npm:postgres@3.4.7";

const EALA_ID = 330332;
const SYNC_LOCK_KEY = 330332;
const MATCH_PAGE_SIZE = 100;
const MAX_MATCH_PAGES = 100;
const MATCH_BATCH_SIZE = 100;
const WTA = "https://api.wtatennis.com/tennis";
const db = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false, ssl: "require", types: { json: { to: 114, from: [114, 3802], serialize: (value: unknown) => value, parse: (value: string) => JSON.parse(value) } } });
const q = (text: string, params: unknown[] = []) => db.unsafe(text, params);

type Row = Record<string, unknown>;
const text = (v: unknown) => typeof v === "string" ? v : "";
const num = (v: unknown) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
function records(payload: unknown, key = ""): Row[] {
  if (Array.isArray(payload)) return payload.filter((v): v is Row => !!v && typeof v === "object");
  if (!payload || typeof payload !== "object") return [];
  const o = payload as Row;
  const v = key ? o[key] : o.content ?? o.matches ?? o.players ?? o.events;
  return Array.isArray(v) ? v.filter((x): x is Row => !!x && typeof x === "object") : [];
}
function dateOnly(value: unknown) {
  const s=text(value);
  if(!s || Number.isNaN(Date.parse(s)))return "";
  return new Date(s).toISOString().slice(0,10);
}
function exactMatchStart(m: Row) {
  for(const v of [m.MatchTimeStamp,m.matchTimeStamp,m.scheduledTime,m.scheduled_time]){
    const s=text(v);
    if(s && /T\d{2}:\d{2}/.test(s) && !Number.isNaN(Date.parse(s)))return s;
  }
  return "";
}
function knownMatchDate(m: Row, exactStart: string | null = "") {
  for(const v of [m.matchDate,m.match_date,m.date]){
    const d=dateOnly(v); if(d)return d;
  }
  if(exactStart)return dateOnly(exactStart);
  for(const v of [m.MatchTimeStamp,m.matchTimeStamp,m.scheduledTime,m.scheduled_time]){
    const d=dateOnly(v); if(d)return d;
  }
  return "";
}
function stableEventId(m: Row, category: string) {
  const key=[category,text(m.tourn_nbr),text(m.tourn_year),text(m.round_name),text(m.player_1),text(m.player_2),text(m.player_3),text(m.player_4),text(m.scores)].join("|");
  let h=2166136261;
  for(let i=0;i<key.length;i++) h=Math.imul(h^key.charCodeAt(i),16777619);
  return Math.abs(h>>>0);
}
function tournament(m: Row): Row { return m.tournament && typeof m.tournament === "object" ? m.tournament as Row : {}; }
function matchStart(m: Row) { return exactMatchStart(m); }
function seasonYear(m: Row) {
  const t=tournament(m);
  return num(m.tourn_year) ?? num(m.year) ?? num(t.year) ?? (() => {
    const d=knownMatchDate(m); return d ? Number(d.slice(0,4)) : null;
  })();
}
function tournamentName(m: Row) { const t=tournament(m); return text(m.TournamentName)||text(m.tournamentName)||text(t.name)||text(t.title)||"Unknown tournament"; }
function completed(m: Row) { return text(m.scores).trim() !== "" && num(m.winner)!==null && text(m.player_2)!=="BYE"; }
function won(m: Row): boolean|null { const w=num(m.winner); if(w===null)return null; if(w===1)return text(m.player_1)===String(EALA_ID); if(w===2)return text(m.player_2)===String(EALA_ID); return null; }
function opponent(m: Row) { const o=m.opponent; if(o&&typeof o==="object") return text((o as Row).fullName)||text((o as Row).name)||"Opponent"; return text(m.player_1)===String(EALA_ID)?text(m.team_name_2)||"Opponent":text(m.team_name_1)||"Opponent"; }
async function getJson(url:string){ const r=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(15000)}); if(!r.ok)throw new Error("WTA API returned "+r.status); return r.json(); }
async function getRanking(type:string,metric:string){
  for(let page=0;page<10;page++){
    const payload=await getJson(WTA+"/players/ranked?type="+type+"&metric="+metric+"&page="+page+"&pageSize=100");
    const rows=records(payload);
    const row=rows.find(r=>r.player&&typeof r.player==="object"&&String((r.player as Row).id)===String(EALA_ID));
    const ranking=num(row?.ranking);
    if(ranking!==null)return {ranking,row};
    if(rows.length<100)break;
  }
  return {ranking:null,row:null};
}
function stringValue(v: unknown) {
  return v === null || v === undefined ? "" : String(v);
}
function matchKey(m: Row, category: string) {
  const t=tournament(m), group=t.tournamentGroup && typeof t.tournamentGroup === "object" ? t.tournamentGroup as Row : {};
  const groupId=num(group.id) ?? num(t.id) ?? num(m.tournamentId);
  const year=num(t.year) ?? num(m.tourn_year);
  return [
    category,
    stringValue(groupId),
    stringValue(year),
    text(m.round_name),
    stringValue(m.player_1),
    stringValue(m.player_2),
    stringValue(m.player_3),
    stringValue(m.player_4)
  ].join("|");
}
function toMatch(m:Row,category:string,exactMatchStart?:string){
  const id=num(m.id)??num(m.eventId)??num(m.event_id)??num(m.matchId)??stableEventId(m,category);
  const t=tournament(m), p1=text(m.player_1), w=num(m.winner);
  const start=exactMatchStart||matchStart(m)||null;
  const matchDate=knownMatchDate(m,start);
  return {event_id:id,player_id:EALA_ID,match_date:matchDate||null,match_start:start,status:text(m.status)||(completed(m)?"completed":"scheduled"),category,
    tournament_name:tournamentName(m),tournament_slug:text(m.tournamentSlug)||text(t.slug)||null,tournament_id:num(t.id)??num(m.tournamentId),
    season_name:text(m.seasonName)||text(m.year)||null,season_id:num(m.seasonId)??num(t.seasonId),round_name:text(m.round_name)||null,round_number:num(m.round_number),
    surface:text(m.Surface)||text(m.surface)||null,winner_side:w===1?"home":w===2?"away":"unknown",
    eala_side:p1===String(EALA_ID)?"home":text(m.player_2)===String(EALA_ID)?"away":"unknown",eala_won:won(m),
    home_players:m.home_players??m.player_1,away_players:m.away_players??m.player_2,set_scores:m.scores??[],
    duration_seconds:num(m.durationSeconds)??num(m.duration_seconds),custom_id:text(m.customId)||null,raw_json:m};
}
async function upsertMatches(list:Row[],category:string,exactStarts:Map<string,string>){
  const rows=list.map(m=>toMatch(m,category,exactStarts.get(matchKey(m,category)))).filter(Boolean) as Row[];
  for(let offset=0;offset<rows.length;offset+=MATCH_BATCH_SIZE){
    const batch=rows.slice(offset,offset+MATCH_BATCH_SIZE);
    const payload=JSON.stringify(batch);
    await q(`insert into public.eala_matches(event_id,player_id,match_date,match_start,status,category,tournament_name,tournament_slug,tournament_id,season_name,season_id,round_name,round_number,surface,winner_side,eala_side,eala_won,home_players,away_players,set_scores,duration_seconds,custom_id,raw_json,updated_at)
      select event_id,player_id,match_date,match_start,status,category,tournament_name,tournament_slug,tournament_id,season_name,season_id,round_name,round_number,surface,winner_side,eala_side,eala_won,home_players,away_players,set_scores,duration_seconds,custom_id,raw_json,now()
      from jsonb_to_recordset($1::jsonb) as x(
        event_id bigint,player_id bigint,match_date date,match_start timestamptz,status text,category text,tournament_name text,tournament_slug text,tournament_id bigint,
        season_name text,season_id bigint,round_name text,round_number integer,surface text,winner_side text,eala_side text,eala_won boolean,
        home_players jsonb,away_players jsonb,set_scores jsonb,duration_seconds integer,custom_id text,raw_json jsonb
      )
      on conflict(event_id) do update set
        player_id=excluded.player_id,match_date=excluded.match_date,match_start=excluded.match_start,status=excluded.status,category=excluded.category,
        tournament_name=excluded.tournament_name,tournament_slug=excluded.tournament_slug,tournament_id=excluded.tournament_id,
        season_name=excluded.season_name,season_id=excluded.season_id,round_name=excluded.round_name,round_number=excluded.round_number,
        surface=excluded.surface,winner_side=excluded.winner_side,eala_side=excluded.eala_side,eala_won=excluded.eala_won,
        home_players=excluded.home_players,away_players=excluded.away_players,set_scores=excluded.set_scores,
        duration_seconds=excluded.duration_seconds,custom_id=excluded.custom_id,raw_json=excluded.raw_json,updated_at=now()
      where public.eala_matches.player_id is distinct from excluded.player_id
        or public.eala_matches.match_date is distinct from excluded.match_date
        or public.eala_matches.match_start is distinct from excluded.match_start
        or public.eala_matches.status is distinct from excluded.status
        or public.eala_matches.category is distinct from excluded.category
        or public.eala_matches.tournament_name is distinct from excluded.tournament_name
        or public.eala_matches.tournament_slug is distinct from excluded.tournament_slug
        or public.eala_matches.tournament_id is distinct from excluded.tournament_id
        or public.eala_matches.season_name is distinct from excluded.season_name
        or public.eala_matches.season_id is distinct from excluded.season_id
        or public.eala_matches.round_name is distinct from excluded.round_name
        or public.eala_matches.round_number is distinct from excluded.round_number
        or public.eala_matches.surface is distinct from excluded.surface
        or public.eala_matches.winner_side is distinct from excluded.winner_side
        or public.eala_matches.eala_side is distinct from excluded.eala_side
        or public.eala_matches.eala_won is distinct from excluded.eala_won
        or public.eala_matches.home_players is distinct from excluded.home_players
        or public.eala_matches.away_players is distinct from excluded.away_players
        or public.eala_matches.set_scores is distinct from excluded.set_scores
        or public.eala_matches.duration_seconds is distinct from excluded.duration_seconds
        or public.eala_matches.custom_id is distinct from excluded.custom_id`,[payload]);
  }
  return rows.length;
}

async function authorized(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;
  const rows = await q("select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1", ["eala_sync_token"]);
  return token === String(rows[0]?.decrypted_secret ?? "");
}

async function dbHttpGetJson(url: string) {
  const rows = await q("select status, content from extensions.http_get($1::varchar)", [url]);
  const response = rows[0] as Row | undefined;
  const status = num(response?.status);
  if (status === null || status < 200 || status >= 300) {
    throw new Error("WTA HTTP returned " + String(response?.status ?? "unknown"));
  }
  const raw = text(response?.content);
  if (!raw) throw new Error("WTA HTTP returned empty content");
  return JSON.parse(raw);
}

async function sync(){
  const lock=await q("select pg_try_advisory_lock($1) as locked",[SYNC_LOCK_KEY]);
  if(lock[0]?.locked !== true)return {skipped:true,reason:"sync_locked"};
  let runId:number|null=null;
  try{
    const run=await q("insert into public.eala_sync_runs(started_at) values(now()) returning id");
    runId=Number(run[0].id);
    const [profile,singles,doubles]=await Promise.all([
      getJson(WTA+"/players/"+EALA_ID),
      getPlayerMatches("S"),
      getPlayerMatches("D")
    ]);
    const [sRank,dRank]=await Promise.all([
      getRanking("rankSingles","singles"),
      getRanking("rankDoubles","doubles")
    ]);
    const p=profile&&typeof profile==="object"?profile as Row:{},po=p.player&&typeof p.player==="object"?p.player as Row:p;
    await q("insert into public.eala_player(player_id,name,slug,country,profile_json,updated_at) values($1,$2,$3,$4,$5::jsonb,now()) on conflict(player_id) do update set name=excluded.name,slug=excluded.slug,country=excluded.country,profile_json=excluded.profile_json,updated_at=now()",[EALA_ID,text(po.fullName)||text(po.name)||"Alexandra Eala",text(po.slug)||"alexandra-eala",text(po.country)||"PHI",JSON.stringify(p)]);
    const year=new Date().getUTCFullYear();
    const exactStarts=await resolveExactMatchStarts(singles.filter(m=>completed(m)&&seasonYear(m)===year&&!exactMatchStart(m)));
    const sc=await upsertMatches(singles,"singles",exactStarts),dc=await upsertMatches(doubles,"doubles",new Map());
    let rc=0;
    for(const [item,kind] of [[sRank,"singles"],[dRank,"doubles"]] as const){
      const ranking=item.ranking;
      if(ranking===null)continue;
      const rankingDate=dateOnly(item.row?.rankedAt) || dateOnly(item.row?.rankingDate);
      if(!rankingDate)continue;
      await q("insert into public.eala_rankings(player_id,ranking_type,ranking,ranking_date,raw_json,updated_at) values($1,$2,$3,$4,$5::jsonb,now()) on conflict(player_id,ranking_type,ranking_date) do update set ranking=excluded.ranking,raw_json=excluded.raw_json,updated_at=now()",[EALA_ID,kind,ranking,rankingDate,JSON.stringify(item.row)]);
      rc++;
    }
    const cy=(a:Row[])=>a.filter(m=>completed(m)&&seasonYear(m)===year);
    const cs=cy(singles),cd=cy(doubles);
    const roundRank=(r:string)=>({R128:1,R64:2,R32:3,R16:4,Q:5,S:6,F:7} as Record<string,number>)[r]??0;
    const wins=(a:Row[])=>a.filter(m=>won(m)===true).length;
    const losses=(a:Row[])=>a.filter(m=>won(m)===false).length;
    const titles=(a:Row[])=>a.filter(m=>text(m.round_name)==="F"&&won(m)===true&&!/125/.test(tournamentName(m))).length;
    const grandSlams:Record<string,{wins:number,losses:number,best:string}>={};
    for(const m of singles){
      if(!completed(m))continue;
      const name=tournamentName(m).toUpperCase();
      const key=name.includes("AUSTRALIAN OPEN")?"Australian Open":name.includes("ROLAND GARROS")||name.includes("FRENCH OPEN")?"French Open":name.includes("WIMBLEDON")?"Wimbledon":name.includes("US OPEN")?"US Open":null;
      if(!key)continue;
      grandSlams[key]??={wins:0,losses:0,best:""};
      if(won(m)===true)grandSlams[key].wins++;
      if(won(m)===false)grandSlams[key].losses++;
      if(roundRank(text(m.round_name))>roundRank(grandSlams[key].best))grandSlams[key].best=text(m.round_name);
    }
    await q("insert into public.eala_season_stats(player_id,season_year,singles_wins,singles_losses,doubles_wins,doubles_losses,singles_titles,doubles_titles,grand_slam_singles,grand_slam_doubles,raw_json,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,now()) on conflict(player_id,season_year) do update set singles_wins=excluded.singles_wins,singles_losses=excluded.singles_losses,doubles_wins=excluded.doubles_wins,doubles_losses=excluded.doubles_losses,singles_titles=excluded.singles_titles,doubles_titles=excluded.doubles_titles,grand_slam_singles=excluded.grand_slam_singles,grand_slam_doubles=excluded.grand_slam_doubles,raw_json=excluded.raw_json,updated_at=now()",[EALA_ID,year,wins(cs),losses(cs),wins(cd),losses(cd),titles(cs),titles(cd),JSON.stringify(grandSlams),"{}",JSON.stringify({source:"WTA",season_year:year,synced_at:new Date().toISOString()})]);
    await q("insert into public.eala_stats(player_id,singles_wins,singles_losses,doubles_wins,doubles_losses,singles_titles,doubles_titles,highest_singles_ranking,highest_doubles_ranking,grand_slam_singles,grand_slam_doubles,raw_json,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,now()) on conflict(player_id) do update set singles_wins=excluded.singles_wins,singles_losses=excluded.singles_losses,doubles_wins=excluded.doubles_wins,doubles_losses=excluded.doubles_losses,singles_titles=excluded.singles_titles,doubles_titles=excluded.doubles_titles,highest_singles_ranking=least(coalesce(public.eala_stats.highest_singles_ranking,excluded.highest_singles_ranking),excluded.highest_singles_ranking),grand_slam_singles=excluded.grand_slam_singles,grand_slam_doubles=excluded.grand_slam_doubles,raw_json=excluded.raw_json,updated_at=now()",[EALA_ID,wins(cs),losses(cs),wins(cd),losses(cd),titles(cs),titles(cd),sRank.ranking,dRank.ranking,JSON.stringify(grandSlams),"{}",JSON.stringify({source:"WTA",synced_at:new Date().toISOString(),season_year:year})]);
    const upcoming=singles.filter(m=>!completed(m)&&text(m.player_2)!=="BYE").map(m=>({m,d:knownMatchDate(m),start:matchStart(m)})).filter(x=>x.d&&Date.parse(x.d+"T23:59:59Z")>=Date.now()-3600000).sort((a,b)=>Date.parse(a.d)-Date.parse(b.d))[0];
    if(upcoming){const m=upcoming.m,t=tournament(m),source=num(m.id)??num(m.eventId)??num(m.event_id)??num(m.matchId); await q("insert into public.eala_next_match(player_id,tournament,round_name,opponent,match_start,surface,venue,tournament_start,tournament_end,source_event_id,raw_json,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now()) on conflict(player_id) do update set tournament=excluded.tournament,round_name=excluded.round_name,opponent=excluded.opponent,match_start=excluded.match_start,surface=excluded.surface,venue=excluded.venue,tournament_start=excluded.tournament_start,tournament_end=excluded.tournament_end,source_event_id=excluded.source_event_id,raw_json=excluded.raw_json,updated_at=now()",[EALA_ID,tournamentName(m),text(m.round_name)||"TBA",opponent(m),upcoming.start||null,text(m.Surface)||text(m.surface)||null,text(m.city)||null,text(t.startDate)||null,text(t.endDate)||null,source,JSON.stringify({...m,scheduled_date:upcoming.d||null})]);}
    else {
      try {
        const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const to = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const tournamentPayload = await getJson(
          WTA+"/tournaments/?page=0&pageSize=100&excludeLevels=ITF&from="+from+"&to="+to
        );
        const upcomingTournaments = records(tournamentPayload)
          .map(item => {
            const group = item.tournamentGroup && typeof item.tournamentGroup === "object" ? item.tournamentGroup as Row : {};
            return {
              groupId: num(group.id),
              year: num(item.year),
              start: text(item.startDate),
              end: text(item.endDate),
              title: text(item.title),
              surface: text(item.surface)
            };
          })
          .filter(item => {
            const now = Date.now();
            const starts = Date.parse(item.start);
            const ends = Date.parse(item.end);
            if (item.groupId === null || item.year === null || !Number.isFinite(starts) || !Number.isFinite(ends)) return false;
            // Include tournaments that are already in progress as well as
            // tournaments starting in the next 60 days. The previous 36-hour
            // start-date window incorrectly skipped Singapore after it had
            // been underway for more than 36 hours.
            return ends >= now - 6 * 60 * 60 * 1000 && starts <= now + 60 * 24 * 60 * 60 * 1000;
          })
          .sort((a,b) => {
            const now = Date.now();
            const aActive = Date.parse(a.start) <= now && Date.parse(a.end) >= now;
            const bActive = Date.parse(b.start) <= now && Date.parse(b.end) >= now;
            if (aActive !== bActive) return aActive ? -1 : 1;
            return Date.parse(a.start)-Date.parse(b.start);
          });

        let placeholder: Row | null = null;
        let placeholderDrawPayload: unknown = null;
        for (const t of upcomingTournaments.slice(0, 8)) {
          if (t.groupId === null || t.year === null) continue;
          try {
            const drawPayload = await dbHttpGetJson(WTA+"/tournaments/"+t.groupId+"/"+t.year+"/draw");
            const drawEvent = drawEvents(drawPayload).find(event =>
              text(event.EventTypeCode) === "LS" || /Women's Singles/i.test(text(event.DrawTypeTitle))
            );
            if (drawEvent) {
              const lines = ((drawEvent.Draw as Row | undefined)?.DrawLine);
              const hasEala = Array.isArray(lines) && lines.some(line =>
                !!line && typeof line === "object" && playerIdsMatch((line as Row).Players)
              );
              if (hasEala) {
                placeholder = t as Row;
                placeholderDrawPayload = drawPayload;
                break;
              }
            }
          } catch {}
          try {
            const payload = await getJson(WTA+"/tournaments/"+t.groupId+"/"+t.year+"/players");
            const players = records(payload,"players").length ? records(payload,"players") : records(payload);
            if (players.some(playerIdsMatch)) {
              placeholder = t as Row;
              break;
            }
          } catch {}
        }

        if (placeholder) {
          let tournamentRecord: { tournament:string; roundName:string; opponent:string; matchStart:string|null; source:Record<string,unknown> } = { tournament: text(placeholder.title) || "Upcoming tournament", roundName: "TBA", opponent: "TBA", matchStart: null, source: {source:"WTA tournament entry",entry_confirmed:true} };
          try {
            const drawPayload = placeholderDrawPayload ?? await dbHttpGetJson(WTA+"/tournaments/"+placeholder.groupId+"/"+placeholder.year+"/draw");
            const drawEvent = drawEvents(drawPayload).find(event =>
              text(event.EventTypeCode) === "LS" || /Women's Singles/i.test(text(event.DrawTypeTitle))
            );
            if (drawEvent) {
              const drawSize = num(drawEvent.DrawSize) ?? 32;
              const drawMatches = drawEventMatches(drawEvent);
              const future = drawMatches
                .filter(item => drawMatchContainsEala(item.match) && num(item.match.finished) !== 1 && text(item.match.mState).toUpperCase() !== "F")
                .sort((a,b) => a.roundId - b.roundId)[0];
              if (future) {
                const roundName = roundNameFromDrawId(future.roundId) || "TBA";
                const matchPlayers = drawMatchPlayers(future.match);
                const opponentName = findDrawOpponent(drawEvent, future.match, future.roundId);
                let timeStamp = text(future.match.MatchTimeStamp);
                if(!timeStamp){
                  try{
                    const matchPayload=await dbHttpGetJson(WTA+"/tournaments/"+placeholder.groupId+"/"+placeholder.year+"/matches");
                    const tournamentMatches=records(matchPayload,"matches");
                    const ealaMatch=tournamentMatches.find(match=>{
                      const p1=stringValue(match.PlayerIDA),p2=stringValue(match.PlayerIDB);
                      const drawId=text(future.match.Id);
                      return (drawId && drawId===text(match.MatchID)) ||
                        (p1===String(EALA_ID)||p2===String(EALA_ID)) &&
                        (!text(match.MatchState)||!["F","C"].includes(text(match.MatchState).toUpperCase()));
                    });
                    if(ealaMatch)timeStamp=text(ealaMatch.MatchTimeStamp);
                  }catch(error){
                    console.error("Upcoming tournament match-feed lookup failed:",error);
                  }
                }
                const scheduledDate = timeStamp ? dateOnly(timeStamp) : "";
                tournamentRecord = {
                  tournament: text(drawEvent.TournamentTitle) || text(placeholder.title) || "Upcoming tournament",
                  roundName,
                  opponent: opponentName,
                  matchStart: timeStamp && !Number.isNaN(Date.parse(timeStamp)) ? timeStamp : null,
                  source: {
                    source:"WTA tournament draw",
                    draw_match_id:text(future.match.Id),
                    draw_round_id:future.roundId,
                    draw_size:drawSize,
                    ...(scheduledDate ? {scheduled_date:scheduledDate} : {})
                  }
                };
              }
            }
          } catch {}
          if(tournamentRecord.source.source === "WTA tournament draw"){
            await q("insert into public.eala_next_match(player_id,tournament,round_name,opponent,match_start,surface,venue,tournament_start,tournament_end,source_event_id,raw_json,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now()) on conflict(player_id) do update set tournament=excluded.tournament,round_name=excluded.round_name,opponent=excluded.opponent,match_start=excluded.match_start,surface=excluded.surface,venue=excluded.venue,tournament_start=excluded.tournament_start,tournament_end=excluded.tournament_end,source_event_id=excluded.source_event_id,raw_json=excluded.raw_json,updated_at=now()",[
              EALA_ID,
              tournamentRecord.tournament,
              tournamentRecord.roundName,
              tournamentRecord.opponent,
              tournamentRecord.matchStart,
              text(placeholder.surface) || "—",
              "—",
              text(placeholder.start) || null,
              text(placeholder.end) || null,
              null,
              JSON.stringify(tournamentRecord.source)
            ]);
          }
        }
      } catch(error) {
        console.error("Next-match fallback discovery failed:", error);
      }
    }
    const found=Boolean(upcoming);
    const placeholderExists=Boolean(await q("select 1 from public.eala_next_match where player_id=$1 limit 1",[EALA_ID]));
    await q("update public.eala_sync_runs set finished_at=now(),success=true,matches_singles=$1,matches_doubles=$2,rankings_updated=$3,next_match_found=$4 where id=$5",[sc,dc,rc,found||placeholderExists,runId]);
    return {ok:true,singles:sc,doubles:dc,rankings:rc,nextMatch:found||placeholderExists};
  }catch(e){
    if(runId!==null)await q("update public.eala_sync_runs set finished_at=now(),success=false,error_message=$1 where id=$2",[e instanceof Error?e.message:String(e),runId]);
    throw e;
  }finally{
    try{await q("select pg_advisory_unlock($1)",[SYNC_LOCK_KEY]);}catch(unlockError){console.error("Failed to release sync advisory lock:",unlockError);}
  }
}
function playerIdsMatch(value: unknown): boolean {
  if (typeof value === "string" || typeof value === "number") return String(value) === String(EALA_ID);
  if (Array.isArray(value)) return value.some(playerIdsMatch);
  if (typeof value === "object" && value !== null) return Object.values(value as Row).some(playerIdsMatch);
  return false;
}

function roundNameFromDrawId(roundId: number | null) {
  return ({1:"F",2:"S",3:"Q",4:"R16",5:"R32",6:"R64",7:"R128"} as Record<number,string>)[roundId ?? 0] ?? "";
}

function roundNameFromTournamentRoundId(roundId: number | null, drawSize: number | null) {
  if (roundId === null || !drawSize || roundId < 1) return "";
  const roundsByDrawSize: Record<number, string[]> = {
    32: ["R32", "R16", "Q", "S", "F"],
    64: ["R64", "R32", "R16", "Q", "S", "F"],
    96: ["R128", "R64", "R32", "R16", "Q", "S", "F"],
    128: ["R128", "R64", "R32", "R16", "Q", "S", "F"],
  };
  return roundsByDrawSize[drawSize]?.[roundId - 1] ?? "";
}

function drawEvents(payload: unknown): Row[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as Row).drawInfo;
  if (!Array.isArray(raw)) return [];
  const events: Row[] = [];
  for (const item of raw) {
    let value: unknown = item;
    if (typeof item === "string") {
      try { value = JSON.parse(item); } catch { continue; }
    }
    if (!value || typeof value !== "object") continue;
    const eventList = (((value as Row).Draws as Row | undefined)?.Events as Row | undefined)?.Event;
    if (!Array.isArray(eventList)) continue;
    for (const event of eventList) {
      if (event && typeof event === "object") events.push(event as Row);
    }
  }
  return events;
}

function drawMatchPlayers(match: Row): Row[] {
  const pts = ((match.Players as Row | undefined)?.PT);
  if (!Array.isArray(pts)) return [];
  return pts.filter((pt): pt is Row => !!pt && typeof pt === "object");
}

function drawPlayerId(pt: Row) {
  const player = pt.Player && typeof pt.Player === "object" ? pt.Player as Row : {};
  const id = num(player.id);
  return id ?? null;
}

function drawPlayerName(pt: Row) {
  const player = pt.Player && typeof pt.Player === "object" ? pt.Player as Row : {};
  return text(pt.PTDisplayLine) || [text(player.FirstName), text(player.SurName)].filter(Boolean).join(" ").trim();
}

function drawMatchContainsEala(match: Row) {
  return drawMatchPlayers(match).some(pt => drawPlayerId(pt) === EALA_ID);
}

function drawEventMatches(event: Row) {
  const rounds = (((event.Results as Row | undefined)?.Round));
  if (!Array.isArray(rounds)) return [] as Array<{roundId:number,match:Row}>;
  const result: Array<{roundId:number,match:Row}> = [];
  for (const round of rounds) {
    if (!round || typeof round !== "object") continue;
    const roundId = num((round as Row).roundId);
    const matches = (round as Row).Match;
    if (roundId === null || !Array.isArray(matches)) continue;
    for (const match of matches) {
      if (match && typeof match === "object") result.push({ roundId, match: match as Row });
    }
  }
  return result;
}

function drawLinePositions(event: Row) {
  const lines = (((event.Draw as Row | undefined)?.DrawLine));
  const positions = new Map<number,{pos:number,name:string}>();
  if (!Array.isArray(lines)) return positions;
  for (const line of lines) {
    if (!line || typeof line !== "object") continue;
    const pos = num((line as Row).Pos);
    if (pos === null) continue;
    const player = (line as Row).Players && typeof (line as Row).Players === "object"
      ? ((line as Row).Players as Row).Player
      : null;
    if (!player || typeof player !== "object") continue;
    const id = num((player as Row).id) ?? 0;
    const name = text((line as Row).DisplayLine) || text((player as Row).PlayerDisplayLine);
    positions.set(id, { pos, name });
  }
  return positions;
}

function findDrawOpponent(event: Row, current: Row, currentRoundId: number) {
  const players = drawMatchPlayers(current);
  const direct = players.find(pt => {
    const id = drawPlayerId(pt);
    return id !== null && id !== 0 && id !== EALA_ID && !/^bye$|^n\/a$/i.test(drawPlayerName(pt));
  });
  if (direct) return drawPlayerName(direct);

  const positions = drawLinePositions(event);
  const ealaInfo = positions.get(EALA_ID);
  if (!ealaInfo) return "TBA";
  const blockStart = Math.floor((ealaInfo.pos - 1) / 4) * 4 + 1;
  const previous = drawEventMatches(event).filter(item => item.roundId === currentRoundId + 1 && !drawMatchContainsEala(item.match));
  const feeder = previous.find(item => drawMatchPlayers(item.match).some(pt => {
    const id = drawPlayerId(pt);
    if (id === null || id === 0 || id === EALA_ID) return false;
    const info = positions.get(id);
    return !!info && info.pos >= blockStart && info.pos <= blockStart + 3;
  }));
  if (!feeder) return "TBA";

  const feederPlayers = drawMatchPlayers(feeder.match).filter(pt => {
    const id = drawPlayerId(pt);
    return id !== null && id !== 0 && id !== EALA_ID && !/^bye$|^n\/a$/i.test(drawPlayerName(pt));
  });
  const finished = num(feeder.match.finished) === 1 || text(feeder.match.mState).toUpperCase() === "F";
  if (finished) {
    const winnerCode = text((feeder.match.Result as Row | undefined)?.winnerPTId);
    const winner = feederPlayers.find(pt => text(pt.id) === winnerCode);
    if (winner) return drawPlayerName(winner);
  }
  if (feederPlayers.length === 1) return drawPlayerName(feederPlayers[0]);
  if (feederPlayers.length >= 2) return "Winner of " + feederPlayers.slice(0, 2).map(drawPlayerName).join(" / ");
  return "TBA";
}


async function getPlayerMatches(type:string){
  const matches:Row[]=[];
  const seen=new Set<string>();
  let previousPageSignature="";
  for(let page=0;page<MAX_MATCH_PAGES;page++){
    const payload=await getJson(
      WTA+"/players/"+EALA_ID+"/matches?page="+page+"&pageSize="+MATCH_PAGE_SIZE+
      "&id="+EALA_ID+"&year=&type="+type+"&sort=desc&tournamentGroupId="
    );
    const rows=records(payload,"matches");
    if(rows.length===0)break;
    const signature=rows.map((row,index)=>{
      const id=num(row.id)??num(row.eventId)??num(row.event_id)??num(row.matchId);
      return id===null?String(index)+":"+matchKey(row,type):String(id);
    }).join(",");
    if(page>0&&signature===previousPageSignature)break;
    previousPageSignature=signature;
    let newRows=0;
    for(const row of rows){
      const id=num(row.id)??num(row.eventId)??num(row.event_id)??num(row.matchId)??null;
      const key=id===null?matchKey(row,type):String(id);
      if(seen.has(key))continue;
      seen.add(key);
      matches.push(row);
      newRows++;
    }
    if(rows.length<MATCH_PAGE_SIZE||newRows===0)break;
  }
  return matches;
}

async function resolveExactMatchStarts(candidates:Row[]){
  const resolved=new Map<string,string>();
  const groups=new Map<string,{groupId:number,year:number,drawSize:number|null,candidates:Row[]}>();
  for(const candidate of candidates){
    if(exactMatchStart(candidate))continue;
    const t=tournament(candidate);
    const group=t.tournamentGroup&&typeof t.tournamentGroup==="object"?t.tournamentGroup as Row:{};
    const groupId=num(group.id)??num(t.id)??num(candidate.tournamentId);
    const year=num(t.year)??num(candidate.tourn_year);
    const drawSize=num(t.singlesDrawSize);
    if(groupId===null||year===null)continue;
    const key=String(groupId)+":"+String(year);
    const existing=groups.get(key);
    if(existing)existing.candidates.push(candidate);
    else groups.set(key,{groupId,year,drawSize,candidates:[candidate]});
  }

  const groupList=[...groups.values()];
  for(let offset=0;offset<groupList.length;offset+=4){
    await Promise.all(groupList.slice(offset,offset+4).map(async group=>{
      try{
        const payload=await dbHttpGetJson(WTA+"/tournaments/"+group.groupId+"/"+group.year+"/matches");
        const matches=records(payload,"matches");
        for(const candidate of group.candidates){
          const candidateP1=stringValue(candidate.player_1),candidateP2=stringValue(candidate.player_2),candidateRound=text(candidate.round_name);
          const exact=matches
            .filter(m=>num(m.PlayerIDA)===EALA_ID||num(m.PlayerIDB)===EALA_ID)
            .map(m=>({m,ts:text(m.MatchTimeStamp),round:roundNameFromTournamentRoundId(num(m.RoundID),group.drawSize)||text(m.round_name)||text(m.roundName)}))
            .filter(x=>x.ts&&!Number.isNaN(Date.parse(x.ts)))
            .filter(x=>{
              const p1=stringValue(x.m.PlayerIDA),p2=stringValue(x.m.PlayerIDB);
              return !candidateP1&&!candidateP2||p1===candidateP1||p1===candidateP2||p2===candidateP1||p2===candidateP2;
            })
            .sort((a,b)=>Date.parse(b.ts)-Date.parse(a.ts))[0];
          if(exact)resolved.set(matchKey(candidate,"singles"),exact.ts);
        }
      }catch(error){
        console.error("Exact match feed refresh failed for tournament",group.groupId,group.year,error);
      }
    }));
  }
  return resolved;
}

Deno.serve(async(req)=>{
  if(req.method!=="GET"&&req.method!=="POST")return Response.json({error:"Method not allowed"},{status:405});
  try{
    if(!(await authorized(req))) return Response.json({ok:false,error:"Unauthorized"},{status:401});
    return Response.json(await sync());
  }catch(e){
    console.error(e);
    return Response.json({ok:false,error:e instanceof Error?e.message:"Sync failed"},{status:500});
  }
});
