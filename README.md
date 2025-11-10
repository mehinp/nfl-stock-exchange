# 🏈 NFL Stock Exchange


NFLSE turns live football into a real-time stock market where fans buy and sell team “shares” that rise and fall with performance. Built with **FastAPI**, **React**, **MySQL**, and **Machine Learning**, it merges sports analytics, finance, and AI to create a truly dynamic fan experience.

---

## ⚡ Overview
Every NFL game becomes a living financial ecosystem:
- 📈 Team values shift instantly with drives, scores, and turnovers  
- 🤖 ML models forecast win probabilities and detect comebacks, allowing users to place flash bets accordingly
- 🔗 Integrated **Kalshi API** provides real market data for team "value" and playoff probability

Using the data from Kalshi, we designed a custom mean reversion algorithm to map consumer demand and determine an organic market equilibrium that continously updates every five seconds, reflecting current forces in the "NFL market"

---

## 🧠 Tech Stack
**Frontend:** React 18, TypeScript, Tailwind CSS  
**Backend:** FastAPI (Python), SQLAlchemy, MySQL  
**ML Models:** XG Boost, Gradient Boost, Random Forest, Logistic Regression
**External Data:** Kalshi API for market baselines  
**Deployment:** Railway (backend + frontend)

---

## 🚀 Features
- Real-time price updates via async background tasks  
- Secure authentication & RESTful trade endpoints  
- AI-driven valuation engine informed by live and external data  
- Fully responsive, low-latency UI connecting sports with finance  

---

## 💡 Highlights
Built during **AI ATL Hackathon 2025**  
✅ Organic prediction market combining user actions + AI forecasts  
✅ Seamless full-stack integration and live deployment  
✅ A new way to experience football through market intelligence  

---

**Live Demo**  
🔗 [YouTube](https://www.youtube.com/watch?v=Ll3uQLXJ-0Q)
