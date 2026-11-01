package main

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func getProjects(ctx context.Context, db *mongo.Database) ([]Project, error) {
	filter := bson.M{"enabled": true}
	cur, err := db.Collection(projectsCollection).Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	out := []Project{}
	for cur.Next(ctx) {
		var p Project
		if err := cur.Decode(&p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, cur.Err()
}

func getHookURLs(ctx context.Context, db *mongo.Database, hookName string) []string {
	filter := bson.M{
		"enabled":                         true,
		"backend.hooks." + hookName: bson.M{"$exists": true, "$ne": ""},
	}
	cur, err := db.Collection(projectsCollection).Find(ctx, filter)
	if err != nil {
		return nil
	}
	defer cur.Close(ctx)

	var urls []string
	for cur.Next(ctx) {
		var p Project
		if err := cur.Decode(&p); err != nil {
			continue
		}
		if u := p.Backend.Hooks[hookName]; u != "" {
			urls = append(urls, u)
		}
	}
	return urls
}

func renameSlugSupplierAnalytics(ctx context.Context, db *mongo.Database) {
	res, err := db.Collection(projectsCollection).UpdateOne(ctx,
		bson.M{"slug": "supplier-analytics"},
		bson.M{"$set": bson.M{"slug": "analytics"}},
	)
	if err != nil {
		log.Printf("rename slug supplier-analytics → analytics: %v", err)
		return
	}
	log.Printf("rename slug supplier-analytics → analytics: matched=%d modified=%d",
		res.MatchedCount, res.ModifiedCount)
}

func seedProjects(ctx context.Context, db *mongo.Database, defaults []Project) {
	col := db.Collection(projectsCollection)

	_, _ = col.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "slug", Value: 1}},
		Options: options.Index().SetUnique(true),
	})

	now := time.Now()
	for _, d := range defaults {
		d.CreatedAt = &now
		d.UpdatedAt = &now

		_, err := col.UpdateOne(ctx,
			bson.M{"slug": d.Slug},
			bson.M{"$setOnInsert": d},
			options.Update().SetUpsert(true),
		)
		if err != nil {
			log.Printf("seed project %q: %v", d.Slug, err)
		} else {
			log.Printf("seed project %q: ok", d.Slug)
		}
	}
}

func defaultProjects(cfg Config) []Project {
	return []Project{
		{
			Slug:    "ui-kit",
			Name:    "UI Kit",
			Type:    ProjectTypeSystem,
			Enabled: true,
			Frontend: ProjectFrontend{
				RemoteURL:  cfg.SeedUIRemoteURL,
				RemoteName: "ui",
				Exposes:    []string{},
			},
		},
	}
}
