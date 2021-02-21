import * as React from "react"
import {graphql} from "gatsby";
import DefaultLayout from "../layouts/default";
import Img from "gatsby-image";

export default ({ data }) => {
    const { title, date, hero } = data.markdown.frontmatter
    const content = data.markdown.html

    const image = hero.childImageSharp.fixed
    return (
        <DefaultLayout>
            <div className="post">
                <div className="frontmatter">
                    <h1>{ title }</h1>
                    <span>{ date }</span>
                    <Img fixed={image} />
                </div>
                <div className="content" dangerouslySetInnerHTML={{__html: content }} />
            </div>
        </DefaultLayout>
    )
}

export const query = graphql`
query($slug: String!) {
    markdown: markdownRemark(frontmatter: { slug: { eq: $slug } }) {
        html
        frontmatter {
            date(formatString: "DD MMM, YYYY")
            slug
            title
            hero {
                childImageSharp {
                  fixed(width: 900, height: 300) {
                    ...GatsbyImageSharpFixed
                  }
                }
              }
        }
    }
}
`