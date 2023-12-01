package billing

import (
	"RichDocter/api"
	"RichDocter/models"
	"fmt"
	"net/http"
	"os"

	stripe "github.com/stripe/stripe-go/v72"
	"github.com/stripe/stripe-go/v72/price"
	"github.com/stripe/stripe-go/v72/product"
)

func GetProductsEndpoint(w http.ResponseWriter, r *http.Request) {
	stripe.Key = os.Getenv("STRIPE_SECRET")
	if stripe.Key == "" {
		api.RespondWithError(w, http.StatusNoContent, "missing stripe secret")
		return
	}
	var products []models.Product

	productListParams := &stripe.ProductListParams{}
	prodIterator := product.List(productListParams)
	var product models.Product
	for prodIterator.Next() {

		prod := prodIterator.Product()
		if prod.DefaultPrice != nil {
			product.ProductID = prod.ID
			product.Name = prod.Name
			product.Description = prod.Description
			p, err := price.Get(prod.DefaultPrice.ID, nil)
			if err != nil {
				api.RespondWithError(w, http.StatusInternalServerError, err.Error())
				return
			}
			product.BillingAmount = fmt.Sprintf("%.2f", float64(p.UnitAmount)/100)
			product.BillingFrequency = string(p.Recurring.Interval)
			product.PriceID = p.ID

			products = append(products, product)
		}

	}
	api.RespondWithJson(w, http.StatusOK, products)
}
