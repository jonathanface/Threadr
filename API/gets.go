package API

func AllStoriesEndPoint(w http.ResponseWriter, r *http.Request) {
	/*
		  session, err := mgo.DialWithInfo(connection_info)
			if err != nil {
				respondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
		  defer session.Close()

			c := session.DB(DATABASE).C(STORIES_COLLECTION)
		  var stories []Story
			err = c.Find(nil).All(&stories)
		  if (err != nil) {
		    respondWithError(w, http.StatusInternalServerError, err.Error())
		    return
		  }
			respondWithJson(w, http.StatusOK, stories)*/
}

func StoryEndPoint(w http.ResponseWriter, r *http.Request) {
	/*
	     sid := mux.Vars(r)["[0-9a-zA-Z]+"]
	     if len(sid) == 0 {
	       respondWithError(w, http.StatusBadRequest, "No story ID received")
	       return
	     }
	     session, err := mgo.DialWithInfo(connection_info)
	     if err != nil {
	   		respondWithError(w, http.StatusInternalServerError, err.Error())
	   		return
	   	}
	     defer session.Close()
	     c := session.DB(DATABASE).C(STORIES_COLLECTION)
	     var story Story
	     if !bson.IsObjectIdHex(sid) {
	       respondWithError(w, http.StatusBadRequest, "invalid story id")
	       return
	     }
	     err = c.Find(bson.M{"_id":bson.ObjectIdHex(sid)}).One(&story)
	     if (err != nil) {
	       respondWithError(w, http.StatusInternalServerError, err.Error())
	       return
	     }
	   	respondWithJson(w, http.StatusOK, story)*/
}