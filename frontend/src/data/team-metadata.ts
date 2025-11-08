export type Division =
  | "AFC East"
  | "AFC West"
  | "AFC North"
  | "AFC South"
  | "NFC East"
  | "NFC West"
  | "NFC North"
  | "NFC South";

export interface TeamMetadata {
  city: string;
  nickname: string;
  abbreviation: string;
  division: Division;
  aliases?: string[];
}

export const teamMetadata: TeamMetadata[] = [
  { city: "Arizona", nickname: "Cardinals", abbreviation: "ARI", division: "NFC West" },
  { city: "Atlanta", nickname: "Falcons", abbreviation: "ATL", division: "NFC South" },
  { city: "Baltimore", nickname: "Ravens", abbreviation: "BAL", division: "AFC North" },
  { city: "Buffalo", nickname: "Bills", abbreviation: "BUF", division: "AFC East" },
  { city: "Carolina", nickname: "Panthers", abbreviation: "CAR", division: "NFC South" },
  { city: "Chicago", nickname: "Bears", abbreviation: "CHI", division: "NFC North" },
  { city: "Cincinnati", nickname: "Bengals", abbreviation: "CIN", division: "AFC North" },
  { city: "Cleveland", nickname: "Browns", abbreviation: "CLE", division: "AFC North" },
  { city: "Dallas", nickname: "Cowboys", abbreviation: "DAL", division: "NFC East" },
  { city: "Denver", nickname: "Broncos", abbreviation: "DEN", division: "AFC West" },
  { city: "Detroit", nickname: "Lions", abbreviation: "DET", division: "NFC North" },
  { city: "Green Bay", nickname: "Packers", abbreviation: "GB", division: "NFC North", aliases: ["GBP"] },
  { city: "Houston", nickname: "Texans", abbreviation: "HOU", division: "AFC South" },
  { city: "Indianapolis", nickname: "Colts", abbreviation: "IND", division: "AFC South" },
  { city: "Jacksonville", nickname: "Jaguars", abbreviation: "JAX", division: "AFC South", aliases: ["JAC"] },
  { city: "Kansas City", nickname: "Chiefs", abbreviation: "KC", division: "AFC West", aliases: ["KCC"] },
  { city: "Las Vegas", nickname: "Raiders", abbreviation: "LV", division: "AFC West", aliases: ["LVR", "Oakland Raiders"] },
  { city: "Los Angeles", nickname: "Chargers", abbreviation: "LAC", division: "AFC West", aliases: ["SD", "San Diego Chargers"] },
  { city: "Los Angeles", nickname: "Rams", abbreviation: "LAR", division: "NFC West", aliases: ["STL", "St. Louis Rams"] },
  { city: "Miami", nickname: "Dolphins", abbreviation: "MIA", division: "AFC East" },
  { city: "Minnesota", nickname: "Vikings", abbreviation: "MIN", division: "NFC North" },
  { city: "New England", nickname: "Patriots", abbreviation: "NE", division: "AFC East", aliases: ["NWE"] },
  { city: "New Orleans", nickname: "Saints", abbreviation: "NO", division: "NFC South", aliases: ["NOS"] },
  {
    city: "New York",
    nickname: "Giants",
    abbreviation: "NYG",
    division: "NFC East",
    aliases: ["New York Giants", "New York G", "NYG"],
  },
  {
    city: "New York",
    nickname: "Jets",
    abbreviation: "NYJ",
    division: "AFC East",
    aliases: ["New York Jets", "New York J", "NYJ"],
  },
  { city: "Philadelphia", nickname: "Eagles", abbreviation: "PHI", division: "NFC East" },
  { city: "Pittsburgh", nickname: "Steelers", abbreviation: "PIT", division: "AFC North" },
  { city: "San Francisco", nickname: "49ers", abbreviation: "SF", division: "NFC West" },
  { city: "Seattle", nickname: "Seahawks", abbreviation: "SEA", division: "NFC West" },
  { city: "Tampa Bay", nickname: "Buccaneers", abbreviation: "TB", division: "NFC South" },
  { city: "Tennessee", nickname: "Titans", abbreviation: "TEN", division: "AFC South" },
  { city: "Washington", nickname: "Commanders", abbreviation: "WAS", division: "NFC East", aliases: ["WFT", "Washington Football Team"] },
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");

const metadataMap = new Map<string, TeamMetadata>();

for (const team of teamMetadata) {
  const keys = [
    `${team.city} ${team.nickname}`,
    `${team.city}`,
    team.nickname,
    team.abbreviation,
    ...(team.aliases ?? []),
  ];

  keys.forEach((key) => {
    if (!key) return;
    metadataMap.set(normalize(key), team);
  });
}

export function findTeamMetadata(name: string): TeamMetadata | undefined {
  const key = normalize(name);
  if (!key) return undefined;

  if (metadataMap.has(key)) {
    return metadataMap.get(key);
  }

  let matchedTeam: TeamMetadata | undefined;
  metadataMap.forEach((team, storedKey) => {
    if (matchedTeam) return;
    if (storedKey.length < 4) return;
    if (key.includes(storedKey) || storedKey.includes(key)) {
      matchedTeam = team;
    }
  });

  return matchedTeam;
}
