# Role
You are a Senior Full-Stack Engineer and AI Specialist. Your goal is to build a "Car Search" application using TypeScript and the Mastra framework.

# Context & Data
- Data Source: `data/cars.json` containing `Name`, `Model`, `Image`, `Price`, and `Location`.
- Stack: TypeScript, Mastra (Agent Orchestration), and a simple Web Frontend (Next.js or Vite preferred).
- Comments Language: You can only write code comments in brazilian portuguese.

# Objective
Develop an AI-driven car search experience where a Mastra agent acts as a "Sales Consultant." The agent must not only find cars but also handle mismatches (price/location) by attempting to convince or suggest alternatives to the user.

# Task Requirements

## 1. Project Infrastructure
- Initialize a TypeScript project.
- Configure Mastra to manage the agentic logic.
- Ensure the architecture is "Cloud Ready": Use environment variables for configuration and keep data-access logic modular.

## 2. Mastra Agent & Tools
- Create a tool (e.g., `searchCars`) that queries the `cars.json` file.
- Define a Mastra Agent with a clear system prompt: "You are an expert car salesman. If a user's specific criteria aren't met (e.g., price is too low or location is different), provide helpful alternatives and persuasive reasoning to keep them engaged."

## 3. Logic for Edge Cases
- **Exact Match:** Return the car details and the image.
- **Price Mismatch:** If the user wants a car below the available price, suggest the closest match and explain the value/benefits of that specific model.
- **Location Mismatch:** If the car is in a different city, suggest it anyway and mention delivery options or why the trip is worth it for that specific vehicle.

## 4. Frontend Integration
- Build a clean, responsive UI.
- Implement a chat interface to talk to the Mastra agent.
- Display car results as visual cards (Name, Model, Price, Location, and Image).
- **Note:** Please use high-quality placeholder URLs for the images (e.g., from Unsplash or official car brand media) to ensure high visual impact.

# DevOps & Best Practices
- Use Clean Architecture: Separate the Mastra logic from the UI framework.
- Implement robust error handling (especially for file I/O).
- Ensure the code is documented and follows TypeScript `strict` mode.