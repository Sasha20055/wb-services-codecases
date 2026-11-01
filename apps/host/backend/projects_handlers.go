package main

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
)

type projectHandlers struct {
	cfg Config
}

func RegisterProjectRoutes(app *fiber.App, cfg Config) {
	h := &projectHandlers{cfg: cfg}
	app.Get("/projects", h.listProjects)
}

func (h *projectHandlers) listProjects(c *fiber.Ctx) error {
	db, err := ConnectDB(h.cfg)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Error: "db"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	projects, err := getProjects(ctx, db)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Error: "server_error"})
	}

	out := make([]ProjectDTO, 0, len(projects))
	for _, p := range projects {
		out = append(out, toProjectDTO(p))
	}
	return c.JSON(out)
}
