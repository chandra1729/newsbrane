
const CONFIG = {
  maxVisibleSignals: 5,
  newsShiftInterval: 15000,
  apiRefreshRate: 2700000,

  topics: [
    {
      name: "India",
      color: "#00ff9c",
      query: "India news OR RBI OR government policy India",
      fallback: [
        "Traffic congestion rises in IT corridor",
        "Heavy rains affect city movement",
        "New infra project announced",
        "Real estate activity picks up",
        "Local government policy update"
      ]
    },
    {
      name: "World",
      color: "#ff5c5c",
      query: "world news OR global economy OR geopolitics OR war OR inflation",
      fallback: [
        "Global markets show volatility",
        "Oil prices impact economies",
        "Geopolitical tensions rising",
        "Interest rates shifting globally",
        "Trade disruptions emerging"
      ]
    },
    {
      name: "Artificial Intelligence",
      color: "#00cfff",
      query: "artificial intelligence OR AI OR OpenAI OR Nvidia OR Google AI",
      fallback: [
        "AI models becoming more powerful",
        "New AI tools released",
        "Automation reshaping industries",
        "AI chip demand rising",
        "Companies investing in AI"
      ]
    }
  ]
};
