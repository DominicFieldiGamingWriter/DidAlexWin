import postgres from "npm:postgres@3.4.7";

const EALA_ID = 330332;
const WTA = "https://api.wtatennis.com/tennis";
const db = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false, ssl: "require", types: { json: { to: 114, from: [114, 3802], serialize: (value: unknown) => value, parse: (value: string) => JSON.parse(value) } } });
const q = (text: string, params: unknown[] = []) => db.unsafe(text, params);

type Row = Record<string, unknown>;
const text = (v: unknown) => typeof v === "string" ? v : "";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
function records(payload: unknown, key = ""): Row[] {
  if (Array.isArray(payload)) return payload.filter((v): v is Row => !!v && typeof v === "object");
  if (!payload || typeof payload !== "object") return [];
  const o = payload as Row;
  const v = key ? o[key] : o.content ?? o.matches ?? o.players ?? o.events;
  return Array.isArray(v) ? v.filter((x): x is Row => !!x && typeof x === "object") : [];
}
function exactDate(m: Row) {
  for (const v of [m.matchDate,m.match_date,m.scheduledTime,m.scheduled_time,m.date]) {
    const s = text(v); if (s && !Number.isNaN(Date.parse(s))) return s;
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
function matchStart(m: Row) { const exact=exactDate(m); if(exact)return exact; const t=tournament(m); return text(t.endDate)||text(m.StartDate)||""; }
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
function toMatch(m:Row,category:string){
  const id=num(m.id)??num(m.eventId)??num(m.event_id)??num(m.matchId)??stableEventId(m,category);
  const t=tournament(m), p1=text(m.player_1), w=num(m.winner);
  return {event_id:id,player_id:EALA_ID,match_start:matchStart(m)||null,status:text(m.status)||(completed(m)?"completed":"scheduled"),category,
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
    await q("insert into public.eala_matches(event_id,player_id,match_start,status,category,tournament_name,tournament_slug,tournament_id,season_name,season_id,round_name,round_number,surface,winner_side,eala_side,eala_won,home_players,away_players,set_scores,duration_seconds,custom_id,raw_json,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19::jsonb,$20,$21,$22::jsonb,now()) on conflict(event_id) do update set player_id=excluded.player_id,match_start=excluded.match_start,status=excluded.status,category=excluded.category,tournament_name=excluded.tournament_name,tournament_slug=excluded.tournament_slug,tournament_id=excluded.tournament_id,season_name=excluded.season_name,season_id=excluded.season_id,round_name=excluded.round_name,round_number=excluded.round_number,surface=excluded.surface,winner_side=excluded.winner_side,eala_side=excluded.eala_side,eala_won=excluded.eala_won,home_players=excluded.home_players,away_players=excluded.away_players,set_scores=excluded.set_scores,duration_seconds=excluded.duration_seconds,custom_id=excluded.custom_id,raw_json=excluded.raw_json,updated_at=now()",[
      r.event_id,r.player_id,r.match_start,r.status,r.category,r.tournament_name,r.tournament_slug,r.tournament_id,
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
  if(recent[0]?.started_at && Date.now()-new Date(recent[0].started_at).getTime()<240000)return {skipped:true};
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
    let rc=0;
    for(const [item,kind] of [[sRank,"singles"],[dRank,"doubles"]] as const){
      const ranking=item.ranking;
      if(ranking===null)continue;
      await q("insert into public.eala_rankings(player_id,ranking_type,ranking,ranking_date,raw_json,updated_at) values($1,$2,$3,current_date,$4::jsonb,now()) on conflict(player_id,ranking_type,ranking_date) do update set ranking=excluded.ranking,raw_json=excluded.raw_json,updated_at=now()",[EALA_ID,kind,ranking,JSON.stringify(item.row)]);
      rc++;
    }
    const year=new Date().getUTCFullYear(), cy=(a:Row[])=>a.filter(m=>completed(m)&&matchStart(m)&&new Date(matchStart(m)).getUTCFullYear()===year);
    const cs=cy(singles),cd=cy(doubles);
    const wins=(a:Row[])=>a.filter(m=>won(m)===true).length;
    const losses=(a:Row[])=>a.filter(m=>won(m)===false).length;
    const titles=(a:Row[])=>a.filter(m=>text(m.round_name)==="F"&&won(m)===true&&!/125/.test(tournamentName(m))).length;
    const roundRank=(r:string)=>({R128:1,R64:2,R32:3,R16:4,Q:5,S:6,F:7} as Record<string,number>)[r]??0;
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
    await q("insert into public.eala_stats(player_id,singles_wins,singles_losses,doubles_wins,doubles_losses,singles_titles,doubles_titles,highest_singles_ranking,highest_doubles_ranking,grand_slam_singles,grand_slam_doubles,raw_json,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,now()) on conflict(player_id) do update set singles_wins=excluded.singles_wins,singles_losses=excluded.singles_losses,doubles_wins=excluded.doubles_wins,doubles_losses=excluded.doubles_losses,singles_titles=excluded.singles_titles,doubles_titles=excluded.doubles_titles,highest_singles_ranking=least(coalesce(public.eala_stats.highest_singles_ranking,excluded.highest_singles_ranking),excluded.highest_singles_ranking),highest_doubles_ranking=least(coalesce(public.eala_stats.highest_doubles_ranking,excluded.highest_doubles_ranking),excluded.highest_doubles_ranking),grand_slam_singles=excluded.grand_slam_singles,grand_slam_doubles=excluded.grand_slam_doubles,raw_json=excluded.raw_json,updated_at=now()",[EALA_ID,wins(cs),losses(cs),wins(cd),losses(cd),titles(cs),titles(cd),sRank.ranking,dRank.ranking,JSON.stringify(grandSlams),"{}",JSON.stringify({source:"WTA",synced_at:new Date().toISOString()})]);
    const upcoming=singles.filter(m=>!completed(m)&&text(m.player_2)!=="BYE").map(m=>({m,d:matchStart(m)})).filter(x=>x.d&&Date.parse(x.d)>=Date.now()-3600000).sort((a,b)=>Date.parse(a.d)-Date.parse(b.d))[0];
    if(upcoming){const m=upcoming.m,t=tournament(m),source=num(m.id)??num(m.eventId)??num(m.event_id)??num(m.matchId); await q("insert into public.eala_next_match(player_id,tournament,round_name,opponent,match_start,surface,venue,tournament_start,tournament_end,source_event_id,raw_json,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now()) on conflict(player_id) do update set tournament=excluded.tournament,round_name=excluded.round_name,opponent=excluded.opponent,match_start=excluded.match_start,surface=excluded.surface,venue=excluded.venue,tournament_start=excluded.tournament_start,tournament_end=excluded.tournament_end,source_event_id=excluded.source_event_id,raw_json=excluded.raw_json,updated_at=now()",[EALA_ID,tournamentName(m),text(m.round_name)||"TBA",opponent(m),upcoming.d,text(m.Surface)||text(m.surface)||null,text(m.city)||null,text(t.startDate)||null,text(t.endDate)||null,source,JSON.stringify(m)]);}
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
          .filter(item => item.groupId !== null && item.year !== null && item.start && Date.parse(item.start) >= Date.now() - 36 * 60 * 60 * 1000)
          .sort((a,b) => Date.parse(a.start)-Date.parse(b.start));

        let placeholder: Row | null = null;
        for (const t of upcomingTournaments) {
          try {
            const payload = await getJson(WTA+"/tournaments/"+t.groupId+"/"+t.year+"/players");
            const players = records(payload,"players").length ? records(payload,"players") : records(payload);
            if (!players.some(playerIdsMatch)) continue;
            placeholder = t as Row;
            break;
          } catch {}
        }

        if (placeholder) {
          await q("insert into public.eala_next_match(player_id,tournament,round_name,opponent,match_start,surface,venue,tournament_start,tournament_end,source_event_id,raw_json,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now()) on conflict(player_id) do update set tournament=excluded.tournament,round_name=excluded.round_name,opponent=excluded.opponent,match_start=excluded.match_start,surface=excluded.surface,venue=excluded.venue,tournament_start=excluded.tournament_start,tournament_end=excluded.tournament_end,source_event_id=excluded.source_event_id,raw_json=excluded.raw_json,updated_at=now()",[
            EALA_ID,
            text(placeholder.title) || "Upcoming tournament",
            "TBA",
            "TBA",
            null,
            text(placeholder.surface) || "—",
            "—",
            text(placeholder.start) || null,
            text(placeholder.end) || null,
            null,
            JSON.stringify({source:"WTA tournament entry",entry_confirmed:true})
          ]);
        } else {
          await q("delete from public.eala_next_match where player_id=$1",[EALA_ID]);
        }
      } catch {
        await q("delete from public.eala_next_match where player_id=$1",[EALA_ID]);
      }
    }
    const found=Boolean(upcoming);
    const placeholderExists=Boolean(await q("select 1 from public.eala_next_match where player_id=$1 limit 1",[EALA_ID]));
    await q("update public.eala_sync_runs set finished_at=now(),success=true,matches_singles=$1,matches_doubles=$2,rankings_updated=$3,next_match_found=$4 where id=$5",[sc,dc,rc,found||placeholderExists,runId]);
    return {ok:true,singles:sc,doubles:dc,rankings:rc,nextMatch:found||placeholderExists};
  }catch(e){await q("update public.eala_sync_runs set finished_at=now(),success=false,error_message=$1 where id=$2",[e instanceof Error?e.message:String(e),runId]);throw e;}
}
function playerIdsMatch(value: unknown): boolean {
  if (typeof value === "string" || typeof value === "number") return String(value) === String(EALA_ID);
  if (Array.isArray(value)) return value.some(playerIdsMatch);
  if (typeof value === "object" && value !== null) return Object.values(value as Row).some(playerIdsMatch);
  return false;
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
