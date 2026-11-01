package main

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

const projectsCollection = "projects"

const (
	ProjectTypeProject = "project"
	ProjectTypeSystem  = "system"
)

type Project struct {
	ID             primitive.ObjectID `bson:"_id,omitempty" json:"_id"`
	Slug           string             `bson:"slug" json:"slug"`
	Name           string             `bson:"name" json:"name"`
	DisplayNameRu  string             `bson:"displayNameRu,omitempty" json:"displayNameRu,omitempty"`
	Type           string             `bson:"type" json:"type"`
	Enabled        bool               `bson:"enabled" json:"enabled"`
	RequiredScopes []string           `bson:"requiredScopes,omitempty" json:"requiredScopes,omitempty"`
	Frontend       ProjectFrontend    `bson:"frontend" json:"frontend"`
	Backend        ProjectBackend     `bson:"backend" json:"backend"`
	CreatedAt      *time.Time         `bson:"createdAt,omitempty" json:"createdAt,omitempty"`
	UpdatedAt      *time.Time         `bson:"updatedAt,omitempty" json:"updatedAt,omitempty"`
}

type ProjectFrontend struct {
	RemoteURL   string   `bson:"remoteUrl" json:"remoteUrl"`
	RemoteName  string   `bson:"remoteName" json:"remoteName"`
	Exposes     []string `bson:"exposes" json:"exposes"`
	WidgetRoute string   `bson:"widgetRoute,omitempty" json:"widgetRoute,omitempty"`
	BasePath    string   `bson:"basePath,omitempty" json:"basePath,omitempty"`
}

type ProjectBackend struct {
	URL   string            `bson:"url,omitempty" json:"url,omitempty"`
	Hooks map[string]string `bson:"hooks,omitempty" json:"hooks,omitempty"`
}

type ProjectDTO struct {
	Slug           string            `json:"slug"`
	Name           string            `json:"name"`
	DisplayNameRu  string            `json:"displayNameRu,omitempty"`
	Type           string            `json:"type"`
	RequiredScopes []string          `json:"requiredScopes,omitempty"`
	Frontend       ProjectFrontend   `json:"frontend"`
	Backend        ProjectBackendDTO `json:"backend"`
}

type ProjectBackendDTO struct {
	URL string `json:"url,omitempty"`
}

func toProjectDTO(p Project) ProjectDTO {
	return ProjectDTO{
		Slug:           p.Slug,
		Name:           p.Name,
		DisplayNameRu:  projectDisplayName(p),
		Type:           p.Type,
		RequiredScopes: p.RequiredScopes,
		Frontend:       p.Frontend,
		Backend:        ProjectBackendDTO{URL: p.Backend.URL},
	}
}

func projectDisplayName(p Project) string {
	if p.DisplayNameRu != "" {
		return p.DisplayNameRu
	}
	return p.Name
}
