KITCHEN RUSH
Game Design Document
Version 1.0  |  Brainstormed by Aliya, Waniya & Mamun
May 2026
# 1. Game Overview

# 2. Core Concept
Kitchen Rush is a relaxed, mentorship-focused restaurant simulation game. Players take on the role of a restaurant owner running a beachfront food shop. Unlike traditional time-pressured restaurant games, Kitchen Rush removes the countdown timer entirely — the focus is on quality, coaching workers, and growing the business through genuine customer feedback and personal improvement.

The game rewards patience, deliberate team-building, and iterative improvement. There is no fail state — only continuous growth.

# 3. Setting & Atmosphere
## 3.1 Location
The restaurant is set on a beautiful beachfront. Players can see the ocean from the shop, and the environment changes throughout the day.

## 3.2 Day-Night Cycle
8:00 AM — Shop opens. Workers arrive. Customers begin coming in.
Throughout the day — Customers arrive, place orders, eat, and leave feedback.
5:00 AM (next day) — Shop closes. Workers go home to sleep.
5:00 AM to 8:00 AM — Quiet hours. Owner reflects, coaches struggling workers, and prepares for the next day.

The visual atmosphere evolves across the day — bright morning light transitions into a warm afternoon glow, and by evening the ocean water shimmers beautifully as the sun sets over the beach.

# 4. Core Gameplay Loop
## 4.1 The Daily Cycle
Each in-game day follows this rhythm:
Customers arrive and place orders for burgers, french fries, chicken nuggets, pizza, drinks, and desserts.
Workers prepare, assemble, and cook orders at their stations.
The owner actively manages the shop — coaching workers, maintaining cleanliness, and overseeing quality.
Customers eat, rate their experience, and leave written feedback.
The AI processes customer feedback into structured scores.
Owner reviews scores, earns money from sales, and invests in improvements.
At closing time, the owner holds pep talks with struggling workers before the next day.

## 4.2 No Time Pressure
Kitchen Rush deliberately removes countdown timers and artificial rush mechanics. Players take as long as they need to prepare each order correctly. The goal is quality and mastery, not speed. Worker speed improves naturally over time as they gain experience — it is never forced.

## 4.3 Owner Responsibilities
The owner (player) juggles multiple active responsibilities during open hours:
Coaching workers through real-time feedback and bubble comments above their heads
Cleaning and maintaining the restaurant (e.g., vacuuming dirty floors)
Reviewing customer feedback scores
Spending earned money on recipe unlocks and upgrades
Assigning tasks to workers when needed

Maintenance tasks take real time, so the owner must prioritize — for example, choosing between coaching a struggling worker or cleaning the floor first.

# 5. Menu & Food Items
The restaurant serves a growing menu as the owner unlocks new items with earned money:
## 5.1 Main Items
Burgers — The core item. Multiple recipe variants unlockable.
French Fries — Classic or spicy. Made by cutting potatoes, seasoning, and frying in oil.
Chicken Nuggets — A crowd favorite.
Pizza — Available as the business grows.

## 5.2 Drinks
Strawberry Lemonade
Dragon Fruit Drinks
Pepsi, Fanta, and other sodas

## 5.3 Desserts
Ice Cream
Ice Pops
Cake and Cupcakes
Rice Pudding
Kids Snacks

New menu items are unlocked progressively as the owner earns money and chooses to expand.

# 6. Workers & Progression
## 6.1 Worker Roles
The kitchen employs multiple workers, each assigned to specific stations or tasks. This allows parallel food preparation and faster service as the team grows.

## 6.2 How Workers Level Up
Workers do not level up automatically. They improve through active coaching by the owner:
The owner gives workers verbal feedback through comment bubbles above their heads.
Workers understand their mistakes and try again the next day.
Over time, workers develop muscle memory — they get faster and more consistent naturally.
New workers start slow. Experienced workers are noticeably more efficient.

## 6.3 Struggling Workers
If a worker is underperforming, the owner does not fire them. Instead:
The owner invites the worker for a one-on-one conversation after closing.
They talk through what went wrong and how to improve.
The worker returns the next day with better understanding and renewed motivation.

This reflects the game's core philosophy: patient mentorship over punitive management.

## 6.4 Worker Economics
Workers earn money based on sales performance — more sales means more earnings for everyone. The better the team performs, the more money flows back into the business and workers' pockets.

# 7. Customer Feedback System
## 7.1 How Feedback Works
After eating, customers leave written comments about their experience. These raw comments are processed by an AI (using Claude API) into structured numerical scores across six key dimensions:


## 7.2 How Scores Are Used
The AI translates customer feedback into improvement goals that the owner can act on — for example, if cleanliness scores drop, the owner knows to spend more time on maintenance. If order timing is poor, it signals that workers need more coaching to build speed.
Both the raw customer comment and the structured scores are shown to the restaurant owner.

# 8. Multiplayer & Competition
## 8.1 Player Types
Kitchen Rush supports two types of registered players:
Restaurant Owners — Run their own shop, manage workers, earn money, and grow their business.
Customers — Register as customers, visit any restaurant, read the virtual menu, taste food, and leave feedback.

## 8.2 Leaderboard
All restaurant owners compete on a global leaderboard based on overall restaurant performance — sales, customer scores, team quality, and business growth. This gives the game a competitive social layer without taking away the collaborative, mentorship-focused feel of individual play.

## 8.3 Customer Interactions
Customers can visit any registered restaurant, browse the menu virtually, and leave scored feedback. Their comments feed directly into the owner's improvement loop — making customer players an essential part of the game ecosystem.

# 9. Progression & Growth
## 9.1 Spending Money
Earned money can be invested in:
Unlocking new recipes and menu items
Upgrading burger and food quality (better ingredients)
Expanding the restaurant (new floors, new food stations)
Growing the team by hiring additional workers

## 9.2 No Fail State
There is no way to lose Kitchen Rush. If sales are low, money is tight, but the owner can always coach their team, improve quality, and rebuild. The game is designed around continuous growth and long-term relationship building with workers and customers.

# 10. Design Philosophy
Kitchen Rush is built around three core values:

Mentorship over management — Workers are people to invest in, not resources to discard.
Quality over speed — Take the time to do things right. Rushed food is bad food.
Growth over competition — The leaderboard exists, but the real reward is watching your team and restaurant thrive.

The beachfront setting, the day-night cycle, and the absence of artificial time pressure all work together to create a game that feels calm, rewarding, and human — a restaurant sim that puts relationships at the center.

# 11. Technical Overview (High Level)
Platform: Web browser (Mac & PC compatible)
Architecture: Backend server with web frontend; multiple players can be logged in simultaneously
Authentication: Players register by name; each owner has their own persistent restaurant
AI Integration: Claude API used to process customer feedback into structured scores
Data: Player restaurants, worker stats, feedback scores, and leaderboard stored server-side

This document reflects the initial brainstorming session. Details subject to change as development progresses.

[TABLE 1]
Game Title | Kitchen Rush
Genre | Restaurant Simulation / Mentorship Game
Platform | Web Browser (Mac & PC)
Players | Multiple registered players, each running their own restaurant
Setting | Beachfront burger shop
Day Cycle | 8:00 AM — 5:00 AM (next day)
Core Theme | Build, coach, and grow a food business through mentorship

[TABLE 2]
Category | What It Measures
Taste & Quality | How good the food actually tastes and the quality of ingredients
Cleanliness | How clean the restaurant and kitchen appear to customers
Seating & Comfort | Whether customers can find a good seat and feel comfortable
Customer Service | How workers treat and interact with customers
Restaurant Vibe | The overall atmosphere and feel of the place
Order Timing | How long it takes to receive the order