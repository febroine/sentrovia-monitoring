CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" varchar(80) NOT NULL,
	"last_name" varchar(80) NOT NULL,
	"email" varchar(255) NOT NULL,
	"department" varchar(120),
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");