import postgres from "npm:postgres@3.4.7";

const EALA_ID = 330332;
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
function exactDate(m: Row) {
  for (const v of [m.MatchTimeStamp,m.matchDate,m.match_date,m.scheduledTime,m.scheduled_time,m.date]) {
    const s = text(v); if (s && !Number.isNaN(Date.parse(s))) return s;
  }
  return "";
}
function exactTimestamp(m: Row) {
  for (const v of [m.MatchTimeStamp,m.scheduledTime,m.scheduled_time,m.matchDate,m.match_date,m.date]) {
    const s = text(v);
    if (s && /T\d{2}:|\d{2}:\d{2}/.test(s) && !Number.isNaN(Date.parse(s))) return s;
  }
  return "";
}
function matchDate(m: Row) {
  const exact = exactDate(m);
  return exact ? exact.slice(0,10) : null;
}
function matchStart(m: Row) {
  return exactTimestamp(m) || "";
}
function seasonYear(m: Row) {
  const t=tournament(m);
  return num(m.tourn_year) ?? num(t.year) ?? num(m.year);
}
function stableEventId(m: Row, category: string) {
  const key=[category,text(m.tourn_nbr),text(m.tourn_year),text(m.round_name),text(m.player_1),text(m.player_2),text(m.player_3),text(m.player_4),text(m.scores)].join("|");
  let h=2166136261;
  for(let i=0;i<key.length;i++) h=Math.imul(h^key.charCodeAt(i),16777619);
  return Math.abs(h>>>0);
}
function tournament(m: Row): Row { return m.tournament && typeof m.tournament === "object" ? m.tournament as Row : {}; }
function tournamentName(m: Row) { const t=tournament(m); return text(m.TournamentName)||text(m.tournamentName)||text(t.name)||text(t.title)||"Unknown tournament"; }
function completed(m: Row) { return text(m.scores).trim() !== "" && num(m.winner)!==null && text(m.player_2)!=="BYE"; }
function won(m: Row): boolean|null { const w=num(m.winner); if(w===null)return null; if(w===1)return text(m.player_1)===String(EALA_ID); if(w===2)return text(m.player_2)===String(EALA_ID); return null; }
function opponent(m: Row) { const o=m.opponent; if(o&&typeof o==="object") return text((o as Row).fullName)||text((o as Row).name)||"Opponent"; return text(m.player_1)===String(EALA_ID)?text(m.team_name_2)||"Opponent":text(m.team_name_1)||"Opponent"; }
async function getJson(url:string){ const r=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(15000)}); if(!r.ok)throw new Error("WTA API returned "+r.status); return r.json(); }
async function dbHttpGetJson(url:string){
  const rows=await q("select status, content from extensions.http_get($1::varchar)",[url]);
  const response=rows[0] as Row|undefined;
  const status=num(response?.status);
  if(status===null||status<200||status>=300)throw new Error("WTA HTTP returned "+String(response?.status??"unknown"));
  const raw=text(response?.content);
  if(!raw)throw new Error("WTA HTTP returned empty content");
  return JSON.parse(raw);
}
async function getTournamentJson(url:string){
  try{
    return await getJson(url);
  }catch{
    return await dbHttpGetJson(url);
  }
}
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
function toMatch(m:Row,category:string){
  const id=num(m.id)??num(m.eventId)??num(m.event_id)??num(m.matchId)??stableEventId(m,category);
  const t=tournament(m), p1=text(m.player_1), w=num(m.winner);
  return {event_id:id,player_id:EALA_ID,match_date:matchDate(m),match_start:matchStart(m)||null,status:text(m.status)||(completed(m)?"completed":"scheduled"),category,
    tournament_name:tournamentName(m),tournament_slug:text(m.tournamentSlug)||text(t.slug)||null,tournament_id:num(t.id)??num(m.tournamentId),
    season_name:text(m.seasonName)||text(m.year)||null,season_id:num(m.seasonId)??num(t.seasonId),round_name:text(m.round_name)||null,round_number:num(m.round_number),
    surface:text(m.Surface)||text(m.surface)||null,winner_side:w===1?"home":w===2?"away":"unknown",
    eala_side:p1===String(EALA_ID)?"home":text(m.player_2)===String(EALA_ID)?"away":"unknown",eala_won:won(m),
    home_players:m.home_players??m.player_1,away_players:m.away_players??m.player_2,set_scores:m.scores??[],
    duration_seconds:num(m.durationSeconds)??num(m.duration_seconds),custom_id:text(m.customId)||null,raw_json:m};
}
async function upsertMatches(list:Row[],category:string){
  const rows=list.map(m=>toMatch(m,category)).filter(Boolean) as Row[];
  for(const r of rows){
    await q("insert into public.eala_matches(event_id,player_id,match_date,match_start,status,category,tournament_name,tournament_slug,tournament_id,season_name,season_id,round_name,round_number,surface,winner_side,eala_side,eala_won,home_players,away_players,set_scores,duration_seconds,custom_id,raw_json,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19::jsonb,$20::jsonb,$21,$22,$23::jsonb,now()) on conflict(event_id) do update set player_id=excluded.player_id,match_date=coalesce(excluded.match_date,public.eala_matches.match_date),match_start=coalesce(excluded.match_start,public.eala_matches.match_start),status=excluded.status,category=excluded.category,tournament_name=excluded.tournament_name,tournament_slug=excluded.tournament_slug,tournament_id=excluded.tournament_id,season_name=excluded.season_name,season_id=excluded.season_id,round_name=excluded.round_name,round_number=excluded.round_number,surface=excluded.surface,winner_side=excluded.winner_side,eala_side=excluded.eala_side,eala_won=excluded.eala_won,home_players=excluded.home_players,away_players=excluded.away_players,set_scores=excluded.set_scores,duration_seconds=excluded.duration_seconds,custom_id=excluded.custom_id,raw_json=public.eala_matches.raw_json || excluded.raw_json,updated_at=now()",[
      r.event_id,r.player_id,r.match_date,r.match_start,r.status,r.category,r.tournament_name,r.tournament_slug,r.tournament_id,
      r.season_name,r.season_id,r.round_name,r.round_number,r.surface,r.winner_side,r.eala_side,r.eala_won,
      JSON.stringify(r.home_players),JSON.stringify(r.away_players),JSON.stringify(r.set_scores),r.duration_seconds,r.custom_id,JSON.stringify(r.raw_json)
    ]);
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

async function sync(){
  const recent=await q("select started_at from public.eala_sync_runs order by started_at desc limit 1");
  if(recent[0]?.started_at && Date.now()-new Date(recent[0].started_at).getTime()<30000)return {skipped:true};
  const run=await q("insert into public.eala_sync_runs(started_at) values(now()) returning id"); const runId=run[0].id;
  try{
    const [profile,sPayload,dPayload]=await Promise.all([
      getJson(WTA+"/players/"+EALA_ID),
      getJson(WTA+"/players/"+EALA_ID+"/matches?page=0&pageSize=500&id="+EALA_ID+"&year=&type=S&sort=desc&tournamentGroupId="),
      getJson(WTA+"/players/"+EALA_ID+"/matches?page=0&pageSize=500&id="+EALA_ID+"&year=&type=D&sort=desc&tournamentGroupId=")
    ]);
    const [sRank,dRank]=await Promise.all([
      getRanking("rankSingles","singles"),
      getRanking("rankDoubles","doubles")
    ]);
    const singles=records(sPayload,"matches"),doubles=records(dPayload,"matches");
    const p=profile&&typeof profile==="object"?profile as Row:{},po=p.player&&typeof p.player==="object"?p.player as Row:p;
    await q("insert into public.eala_player(player_id,name,slug,country,profile_json,updated_at) values($1,$2,$3,$4,$5::jsonb,now()) on conflict(player_id) do update set name=excluded.name,slug=excluded.slug,country=excluded.country,profile_json=excluded.profile_json,updated_at=now()",[EALA_ID,text(po.fullName)||text(po.name)||"Alexandra Eala",text(po.slug)||"alexandra-eala",text(po.country)||"PHI",JSON.stringify(p)]);
    const sc=await upsertMatches(singles,"singles"),dc=await upsertMatches(doubles,"doubles");
    await q("delete from public.eala_rankings where player_id=$1 and raw_json->>'rankedAt' is not null and ranking_date <> (raw_json->>'rankedAt')::date",[EALA_ID]);
    let rc=0;
    for(const [item,kind] of [[sRank,"singles"],[dRank,"doubles"]] as const){
      const ranking=item.ranking;
      const rankedAt=text((item.row as Row | null)?.rankedAt);
      const rankingDate=rankedAt&&!Number.isNaN(Date.parse(rankedAt))?rankedAt.slice(0,10):null;
      if(ranking===null||!rankingDate)continue;
      await q("insert into public.eala_rankings(player_id,ranking_type,ranking,ranking_date,raw_json,updated_at) values($1,$2,$3,$4::date,$5::jsonb,now()) on conflict(player_id,ranking_type,ranking_date) do update set ranking=excluded.ranking,raw_json=excluded.raw_json,updated_at=now()",[EALA_ID,kind,ranking,rankingDate,JSON.stringify(item.row)]);
      rc++;
    }
    const year=new Date().getUTCFullYear();
    const cy=(a:Row[])=>a.filter(m=>completed(m)&&seasonYear(m)===year);
    const cs=cy(singles),cd=cy(doubles);
    const roundRank=(r:string)=>({R128:1,R64:2,R32:3,R16:4,Q:5,S:6,F:7} as Record<string,number>)[r]??0;
    // Refresh exact timestamps for every current-year singles match. The WTA
    // player-history feed uses tournament dates, while the tournament match
    // feed contains the real scheduled timestamp.
    for (const candidate of cs) await refreshExactMatchStart(candidate);
    const wins=(a:Row[])=>a.filter(m=>won(m)===true).length;
    const losses=(a:Row[])=>a.filter(m=>won(m)===false).length;
    const titles=(a:Row[])=>a.filter(m=>text(m.round_name)==="F"&&won(m)===true&&!/125/.test(tournamentName(m))).length;
    const grandSlams:Record<string,{wins:number,losses:number,best:string}>={};
    const seasonGrandSlams:Record<string,{wins:number,losses:number,best:string}>={};
    for(const m of singles){
      if(!completed(m))continue;
      const name=tournamentName(m).toUpperCase();
      const key=name.includes("AUSTRALIAN OPEN")?"Australian Open":name.includes("ROLAND GARROS")||name.includes("FRENCH OPEN")?"French Open":name.includes("WIMBLEDON")?"Wimbledon":name.includes("US OPEN")?"US Open":null;
      if(!key)continue;
      grandSlams[key]??={wins:0,losses:0,best:""};
      if(won(m)===true)grandSlams[key].wins++;
      if(won(m)===false)grandSlams[key].losses++;
      if(roundRank(text(m.round_name))>roundRank(grandSlams[key].best))grandSlams[key].best=text(m.round_name);
      if(seasonYear(m)===year){
        seasonGrandSlams[key]??={wins:0,losses:0,best:""};
        if(won(m)===true)seasonGrandSlams[key].wins++;
        if(won(m)===false)seasonGrandSlams[key].losses++;
        if(roundRank(text(m.round_name))>roundRank(seasonGrandSlams[key].best))seasonGrandSlams[key].best=text(m.round_name);
      }
    }
    await q("insert into public.eala_stats(player_id,singles_wins,singles_losses,doubles_wins,doubles_losses,singles_titles,doubles_titles,highest_singles_ranking,highest_doubles_ranking,grand_slam_singles,grand_slam_doubles,raw_json,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,now()) on conflict(player_id) do update set singles_wins=excluded.singles_wins,singles_losses=excluded.singles_losses,doubles_wins=excluded.doubles_wins,doubles_losses=excluded.doubles_losses,singles_titles=excluded.singles_titles,doubles_titles=excluded.doubles_titles,highest_singles_ranking=least(coalesce(public.eala_stats.highest_singles_ranking,excluded.highest_singles_ranking),excluded.highest_singles_ranking),highest_doubles_ranking=least(coalesce(public.eala_stats.highest_doubles_ranking,excluded.highest_doubles_ranking),excluded.highest_doubles_ranking),grand_slam_singles=excluded.grand_slam_singles,grand_slam_doubles=excluded.grand_slam_doubles,raw_json=excluded.raw_json,updated_at=now()",[EALA_ID,wins(cs),losses(cs),wins(cd),losses(cd),titles(cs),titles(cd),sRank.ranking,dRank.ranking,JSON.stringify(grandSlams),"{}",JSON.stringify({source:"WTA",synced_at:new Date().toISOString()})]);
    await q("insert into public.eala_season_stats(player_id,season_year,singles_wins,singles_losses,doubles_wins,doubles_losses,singles_titles,doubles_titles,grand_slam_singles,grand_slam_doubles,raw_json,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,now()) on conflict(player_id,season_year) do update set singles_wins=excluded.singles_wins,singles_losses=excluded.singles_losses,doubles_wins=excluded.doubles_wins,doubles_losses=excluded.doubles_losses,singles_titles=excluded.singles_titles,doubles_titles=excluded.doubles_titles,grand_slam_singles=excluded.grand_slam_singles,grand_slam_doubles=excluded.grand_slam_doubles,raw_json=excluded.raw_json,updated_at=now()",[EALA_ID,year,wins(cs),losses(cs),wins(cd),losses(cd),titles(cs),titles(cd),JSON.stringify(seasonGrandSlams),"{}",JSON.stringify({source:"WTA",season_year:year,synced_at:new Date().toISOString()})]);
    const upcoming=singles
      .filter(m=>!completed(m)&&text(m.player_2)!=="BYE")
      .map(m=>({m,start:matchStart(m),date:matchDate(m)}))
      .filter(x=>x.start&&Date.parse(x.start)>=Date.now()-3600000)
      .sort((a,b)=>{
        const ad=a.start?Date.parse(a.start):Date.parse(a.date!);
        const bd=b.start?Date.parse(b.start):Date.parse(b.date!);
        return ad-bd;
      })[0];

    if(upcoming){
      const m=upcoming.m,t=tournament(m),source=num(m.id)??num(m.eventId)??num(m.event_id)??num(m.matchId);
      await q("insert into public.eala_next_match(player_id,tournament,round_name,opponent,match_date,match_start,surface,venue,tournament_start,tournament_end,source_event_id,raw_json,updated_at) values($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,now()) on conflict(player_id) do update set tournament=excluded.tournament,round_name=excluded.round_name,opponent=excluded.opponent,match_date=excluded.match_date,match_start=excluded.match_start,surface=excluded.surface,venue=excluded.venue,tournament_start=excluded.tournament_start,tournament_end=excluded.tournament_end,source_event_id=excluded.source_event_id,raw_json=excluded.raw_json,updated_at=now()",[EALA_ID,tournamentName(m),text(m.round_name)||"TBA",opponent(m),upcoming.date,upcoming.start||null,text(m.Surface)||text(m.surface)||null,text(m.city)||null,text(t.startDate)||null,text(t.endDate)||null,source,JSON.stringify(m)]);
    } else {
      try {
        const from=new Date(Date.now()-24*60*60*1000).toISOString().slice(0,10);
        const to=new Date(Date.now()+60*24*60*60*1000).toISOString().slice(0,10);
        const tournamentPayload=await getTournamentJson(WTA+"/tournaments?page=0&pageSize=100&excludeLevels=ITF&from="+from+"&to="+to);
        const upcomingTournaments=records(tournamentPayload,"tournaments").map(item=>{
          const group=item.tournamentGroup&&typeof item.tournamentGroup==="object"?item.tournamentGroup as Row:{};
          return {groupId:num(group.id),year:num(item.year),start:text(item.startDate),end:text(item.endDate),title:text(item.title),surface:text(item.surface),drawSize:num(item.singlesDrawSize)};
        }).filter(item=>{
          const now=Date.now(),starts=Date.parse(item.start),ends=Date.parse(item.end);
          return item.groupId!==null&&item.year!==null&&Number.isFinite(starts)&&Number.isFinite(ends)&&ends>=now-6*60*60*1000&&starts<=now+60*24*60*60*1000;
        }).sort((a,b)=>{
          const now=Date.now(),aa=Date.parse(a.start)<=now&&Date.parse(a.end)>=now,ba=Date.parse(b.start)<=now&&Date.parse(b.end)>=now;
          if(aa!==ba)return aa?-1:1;
          return Date.parse(a.start)-Date.parse(b.start);
        });

        let placeholder:Row|null=null,placeholderDrawPayload:unknown=null,placeholderMatchPayload:unknown=null,successfulChecks=0;
        for(let batchStart=0;batchStart<upcomingTournaments.length;batchStart+=8){
          const batch=upcomingTournaments.slice(batchStart,batchStart+8);
          for(const t of batch){
            if(t.groupId===null||t.year===null)continue;

          try{
            const matchPayload=await getTournamentJson(WTA+"/tournaments/"+t.groupId+"/"+t.year+"/matches");
            successfulChecks++;
            const scheduledMatches=records(matchPayload,"matches")
              .filter(item=>text(item.PlayerIDA)===String(EALA_ID)||text(item.PlayerIDB)===String(EALA_ID))
              .filter(item=>{
                const ts=text(item.MatchTimeStamp);
                const finished=num(item.finished)===1||text(item.mState).toUpperCase()==="F";
                return !finished && ((ts && !Number.isNaN(Date.parse(ts)) && Date.parse(ts)>=Date.now()-3600000) || !ts);
              })
              .sort((a,b)=>{
                const ta=text(a.MatchTimeStamp),tb=text(b.MatchTimeStamp);
                if(ta&&tb)return Date.parse(ta)-Date.parse(tb);
                const ra=num(a.RoundID)??999;
                const rb=num(b.RoundID)??999;
                return ra-rb;
              });
            if(scheduledMatches.length){
              placeholder=t as Row;
              placeholderMatchPayload=matchPayload;
              break;
            }
          }catch{}


          if(t.groupId===null||t.year===null)continue;
          try{
            const drawPayload=await getTournamentJson(WTA+"/tournaments/"+t.groupId+"/"+t.year+"/draw");
            successfulChecks++;
            const drawEvent=drawEvents(drawPayload).find(event=>text(event.EventTypeCode)==="LS"||/Women's Singles/i.test(text(event.DrawTypeTitle)));
            if(drawEvent){
              const lines=((drawEvent.Draw as Row|undefined)?.DrawLine);
              if(Array.isArray(lines)&&lines.some(line=>!!line&&typeof line==="object"&&playerIdsMatch((line as Row).Players))){placeholder=t as Row;placeholderDrawPayload=drawPayload;break;}
            }
          }catch{}
          try{
            const payload=await getTournamentJson(WTA+"/tournaments/"+t.groupId+"/"+t.year+"/players");
            successfulChecks++;
            const players=records(payload,"players").length?records(payload,"players"):records(payload);
            if(players.some(playerIdsMatch)){placeholder=t as Row;break;}
          }catch{}
          }
          if(placeholder)break;
        }

        if(successfulChecks===0){
          console.error("Next-match discovery checks all failed; retaining existing record.");
        }else if(placeholder){
          const placeholderDrawSize=num(placeholder.singlesDrawSize)??num(placeholder.drawSize)??32;
          let record={tournament:text(placeholder.title)||"Upcoming tournament",roundName:"TBA",opponent:"TBA",matchDate:null as string|null,matchStart:null as string|null,source:{source:"WTA tournament entry",entry_confirmed:true}};

          if(placeholderMatchPayload){
            try{
              const scheduled=records(placeholderMatchPayload,"matches")
                .filter(item=>text(item.PlayerIDA)===String(EALA_ID)||text(item.PlayerIDB)===String(EALA_ID))
                .filter(item=>{
                  const ts=text(item.MatchTimeStamp);
                  const finished=num(item.finished)===1||text(item.mState).toUpperCase()==="F";
                  return !finished && ts && !Number.isNaN(Date.parse(ts)) && Date.parse(ts)>=Date.now()-3600000;
                })
                .sort((a,b)=>Date.parse(text(a.MatchTimeStamp))-Date.parse(text(b.MatchTimeStamp)))[0];

              if(scheduled){
                const playerA=text(scheduled.PlayerIDA);
                const playerB=text(scheduled.PlayerIDB);
                const opponentId=playerA===String(EALA_ID)?playerB:playerA;
                let opponentName="";
                try{
                  const opponentPayload=await getTournamentJson(WTA+"/players/"+opponentId);
                  const opponentRecord=opponentPayload&&typeof opponentPayload==="object"
                    ? ((opponentPayload as Row).player&&typeof (opponentPayload as Row).player==="object"
                      ? (opponentPayload as Row).player as Row
                      : opponentPayload as Row)
                    : {};
                  opponentName=text(opponentRecord.fullName)||text(opponentRecord.name);
                }catch{}
                const ts=text(scheduled.MatchTimeStamp);
                record={
                  tournament:text(placeholder.title)||"Upcoming tournament",
                  roundName:roundNameFromTournamentRoundId(num(scheduled.RoundID),placeholderDrawSize)||"TBA",
                  opponent:opponentName||"Opponent",
                  matchDate:ts.slice(0,10),
                  matchStart:ts,
                  source:{source:"WTA tournament matches",match_id:text(scheduled.MatchID)||text(scheduled.Id),round_id:num(scheduled.RoundID)}
                };
              }
            }catch(e){
              console.error("Scheduled-match normalization failed:",e);
            }
          }
          try{
            const drawPayload=placeholderDrawPayload??await getTournamentJson(WTA+"/tournaments/"+placeholder.groupId+"/"+placeholder.year+"/draw");
            const drawEvent=drawEvents(drawPayload).find(event=>text(event.EventTypeCode)==="LS"||/Women's Singles/i.test(text(event.DrawTypeTitle)));
            if(drawEvent){
              const drawSize=num(drawEvent.DrawSize)??placeholderDrawSize;
              const future=drawEventMatches(drawEvent).filter(item=>drawMatchContainsEala(item.match)&&num(item.match.finished)!==1&&text(item.match.mState).toUpperCase()!=="F").sort((a,b)=>a.roundId-b.roundId)[0];
              if(future){
                const ts=text(future.match.MatchTimeStamp),valid=ts&&!Number.isNaN(Date.parse(ts));
                const drawOpponent=findDrawOpponent(drawEvent,future.match,future.roundId);
                const drawRound=roundNameFromDrawId(future.roundId)||"TBA";
                record={
                  ...record,
                  tournament:text(drawEvent.TournamentTitle)||record.tournament,
                  roundName:drawRound==="TBA"?record.roundName:drawRound,
                  opponent:record.opponent==="Opponent"||record.opponent==="TBA"?drawOpponent:record.opponent,
                  source:{...record.source,draw_match_id:text(future.match.Id),draw_round_id:future.roundId,draw_size:drawSize}
                };
                if(!record.matchStart && valid){
                  record.matchDate=ts.slice(0,10);
                  record.matchStart=ts;
                }

                try{
                  const matchPayload=await getTournamentJson(WTA+"/tournaments/"+placeholder.groupId+"/"+placeholder.year+"/matches");
                  const scheduled=records(matchPayload,"matches")
                    .filter(item=>
                      text(item.PlayerIDA)===String(EALA_ID) ||
                      text(item.PlayerIDB)===String(EALA_ID)
                    )
                    .filter(item=>{
                      const ts2=text(item.MatchTimeStamp);
                      return ts2 && !Number.isNaN(Date.parse(ts2)) && Date.parse(ts2)>=Date.now()-3600000;
                    })
                    .sort((a,b)=>Date.parse(text(a.MatchTimeStamp))-Date.parse(text(b.MatchTimeStamp)))[0];

                  if(scheduled){
                    const scheduledTs=text(scheduled.MatchTimeStamp);
                    const scheduledRound=roundNameFromTournamentRoundId(num(scheduled.RoundID),drawSize)||record.roundName;
                    record={
                      ...record,
                      roundName:scheduledRound,
                      matchDate:scheduledTs.slice(0,10),
                      matchStart:scheduledTs,
                      source:{...record.source,match_feed_id:text(scheduled.MatchID)||text(scheduled.Id)}
                    };
                  }
                }catch(e){
                  console.error("Tournament match-feed refresh failed; retaining draw details:",e);
                }
              }
            }
          }catch(e){console.error("Draw refresh failed:",e);}
          await q("insert into public.eala_next_match(player_id,tournament,round_name,opponent,match_date,match_start,surface,venue,tournament_start,tournament_end,source_event_id,raw_json,updated_at) values($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,now()) on conflict(player_id) do update set tournament=excluded.tournament,round_name=excluded.round_name,opponent=excluded.opponent,match_date=excluded.match_date,match_start=excluded.match_start,surface=excluded.surface,venue=excluded.venue,tournament_start=excluded.tournament_start,tournament_end=excluded.tournament_end,source_event_id=excluded.source_event_id,raw_json=excluded.raw_json,updated_at=now()",[EALA_ID,record.tournament,record.roundName,record.opponent,record.matchDate,record.matchStart,text(placeholder.surface)||"—","—",text(placeholder.start)||null,text(placeholder.end)||null,null,JSON.stringify(record.source)]);
        }else{
          await q("delete from public.eala_next_match where player_id=$1",[EALA_ID]);
        }
      }catch(e){
        console.error("Next-match discovery failed; retaining existing record:",e);
      }
    }

    const nextMatchExists=Boolean(await q("select 1 from public.eala_next_match where player_id=$1 limit 1",[EALA_ID]));
    await q("update public.eala_sync_runs set finished_at=now(),success=true,matches_singles=$1,matches_doubles=$2,rankings_updated=$3,next_match_found=$4 where id=$5",[sc,dc,rc,nextMatchExists,runId]);
    return {ok:true,singles:sc,doubles:dc,rankings:rc,nextMatch:nextMatchExists};
  }catch(e){await q("update public.eala_sync_runs set finished_at=now(),success=false,error_message=$1 where id=$2",[e instanceof Error?e.message:String(e),runId]);throw e;}
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
    28: ["R32", "R16", "Q", "S", "F"],
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


async function refreshExactMatchStart(candidate: Row) {
  const t = tournament(candidate);
  const group = t.tournamentGroup && typeof t.tournamentGroup === "object" ? t.tournamentGroup as Row : {};
  const groupId = num(group.id) ?? num(t.id) ?? num(candidate.tournamentId);
  const year = num(t.year) ?? num(candidate.tourn_year);
  const drawSize = num(t.singlesDrawSize);
  if (groupId === null || year === null) return;
  try {
    const payload = await getTournamentJson(WTA+"/tournaments/"+groupId+"/"+year+"/matches");
    const matches = records(payload, "matches");
    const candidateP1 = text(candidate.player_1), candidateP2 = text(candidate.player_2), candidateRound = text(candidate.round_name);
    const exact = matches
      .filter(m => text(m.PlayerIDA) === String(EALA_ID) || text(m.PlayerIDB) === String(EALA_ID))
      .map(m => ({ m, ts: text(m.MatchTimeStamp), round: roundNameFromTournamentRoundId(num(m.RoundID), drawSize) }))
      .filter(x => x.ts && !Number.isNaN(Date.parse(x.ts)) && x.round === candidateRound)
      .filter(x => {
        const p1 = text(x.m.PlayerIDA), p2 = text(x.m.PlayerIDB);
        return (p1 === candidateP1 || p1 === candidateP2 || p2 === candidateP1 || p2 === candidateP2);
      })
      .sort((a,b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
    if (!exact) return;
    const merged = JSON.stringify({ MatchTimeStamp: exact.ts, Venue: exact.m.Venue ?? null });
    await q("update public.eala_matches set match_date=$1::date, match_start=$2, raw_json=raw_json || $3::jsonb, updated_at=now() where player_id=$4 and category='singles' and raw_json->>'tourn_year'=$5 and raw_json->>'round_name'=$6 and raw_json->>'player_1'=$7 and raw_json->>'player_2'=$8", [
      exact.ts.slice(0,10),exact.ts,merged,EALA_ID,String(candidate.tourn_year),candidateRound,candidateP1,candidateP2
    ]);

  } catch {}
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
