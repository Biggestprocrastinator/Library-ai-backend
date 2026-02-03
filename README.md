
# Library AI Backend

> AI CHATBOT for serving and searching a books catalog .

## Table of Contents
- [About](#about)
- [Features](#features)
- [Requirements](#requirements)
- [Getting Started](#getting-started)
  - [Clone](#clone)
  - [Install Dependencies](#install-dependencies)
  - [Run](#run)
- [Configuration](#configuration)
- [API](#api)
  - [GET /](#get-)
  - [GET /books](#get-books)
  - [GET /books/:id](#get-booksid)
  - [POST /search](#post-search)
- [Data Format (`books.json`)](#data-format-booksjson)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

---

## About
`Library-ai-backend` is a small Node.js backend for serving a collection of books stored in a JSON file. It is designed to act as a simple REST API that can be consumed by a frontend application or an AI-powered interface to query book metadata.

This documentation assumes the repository contains:
- `server.js`
- `package.json`
- `books.json`

## Features
- Serve a static `books.json` catalog
- REST-style API endpoints
- Easy to extend with AI search, databases, or authentication
- Lightweight and beginner-friendly backend structure

## Requirements
- Node.js (v14 or newer recommended)
- npm (comes with Node.js)

## Getting Started

### Clone

git clone https://github.com/Biggestprocrastinator/Library-ai-backend.git
cd Library-ai-backend


### Install Dependencies


npm install

### Run


npm start


If a development script exists:


npm run dev


Expected output:


Server running on http://localhost:3000


## Configuration

The backend may use the following environment variables:

| Variable | Description | Default |
| -------- | ----------- | ------- |
| PORT     | Server port | 3000    |

Example `.env` file:


PORT=3000


## API

### GET /

**Description:** Health check or welcome route
**Response:**


{
  "message": "Library AI Backend is running"
}

### GET /books

**Description:** Returns all books
**Response:**


[
  {
    "id": "1",
    "title": "Example Book",
    "author": "Author Name",
    "year": 2020,
    "genre": "Fiction",
    "summary": "Short description"
  }
]


### GET /books/:id

**Description:** Returns a book by ID
**Response:**

{
  "id": "1",
  "title": "Example Book",
  "author": "Author Name"
}


**Errors:**

* `404 Not Found` if the book does not exist

### POST /search

**Description:** Search books using a query
**Request Body:**

{
  "query": "machine learning",
  "filters": {
    "genre": "Technology",
    "yearFrom": 2015
  }
}

**Response:**


[
  {
    "id": "3",
    "title": "Machine Learning Basics"
  }
]


## Data Format (`books.json`)

Example structure:


[
  {
    "id": "1",
    "title": "Clean Code",
    "author": "Robert C. Martin",
    "year": 2008,
    "genre": "Software Engineering",
    "summary": "A handbook of agile software craftsmanship."
  }
]

## Development

Recommended tools:

* `nodemon` for auto-reload
* `morgan` for logging

Example `package.json` scripts:


{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  }
}


## Testing

Test endpoints using curl or Postman:

curl http://localhost:3000/books


## Deployment

You can deploy this backend on:

* Render


## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Open a pull request



## Contact

GitHub Repository:
[https://github.com/Biggestprocrastinator/Library-ai-backend](https://github.com/Biggestprocrastinator/Library-ai-backend)

```
```
