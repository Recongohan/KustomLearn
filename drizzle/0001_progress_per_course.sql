ALTER TABLE "progress" DROP CONSTRAINT "progress_user_id_item_id_pk", ADD CONSTRAINT "progress_user_id_course_id_item_id_pk" PRIMARY KEY("user_id","course_id","item_id");
