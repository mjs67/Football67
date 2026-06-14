const TOKEN = "2da889bb8bf64e24ad6bc9f1e98641db";
const r = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
  headers: { "X-Auth-Token": TOKEN },
});
const d = await r.json();
d.matches
  .filter((m) => /Morocco|Switzerland/.test(m.homeTeam.name + m.awayTeam.name))
  .forEach((m) =>
    console.log(
      m.homeTeam.shortName,
      m.score.fullTime.home, "-", m.score.fullTime.away,
      m.awayTeam.shortName,
      "[" + m.status + "]"
    )
  );
